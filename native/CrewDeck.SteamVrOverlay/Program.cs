using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;
using Valve.VR;

internal static class Program
{
    private const uint Magic = 0x43445256; // CDRV
    private const uint WristFrame = 1;
    private const uint PanelFrame = 2;
    private const uint CommandFrame = 10;
    private const uint HmdIndex = 0;
    private static readonly CancellationTokenSource Stop = new();
    private static readonly object VrLock = new();
    private static CVRSystem? _system;
    private static CVROverlay? _overlay;
    private static ulong _wrist;
    private static ulong _panel;
    private static string _hand = "left";
    private static float _wristAlpha = .08f;
    private static HmdMatrix34_t _panelTransform;
    private static string _panelAnchor = "world";

    public static async Task<int> Main(string[] args)
    {
        Console.OutputEncoding = Encoding.UTF8;
        _hand = args.FirstOrDefault(value => value is "left" or "right") ?? "left";
        AppDomain.CurrentDomain.ProcessExit += (_, _) => Shutdown();
        Console.CancelKeyPress += (_, eventArgs) => { eventArgs.Cancel = true; Stop.Cancel(); };

        if (!TryInitialize()) return 2;
        Write(new { type = "ready", hand = _hand });

        var input = ReadInputAsync(Stop.Token);
        try
        {
            while (!Stop.IsCancellationRequested)
            {
                lock (VrLock)
                {
                    PollEvents(_wrist, "wrist", 420, 180);
                    PollEvents(_panel, "panel", 1280, 800);
                    UpdateWristPoseAndFade();
                    if (_panelAnchor != "world") PositionPanel();
                }
                await Task.Delay(16, Stop.Token);
            }
        }
        catch (OperationCanceledException) { }
        finally
        {
            Stop.Cancel();
            try { await input; } catch { }
            Shutdown();
        }
        return 0;
    }

    private static bool TryInitialize()
    {
        var error = EVRInitError.None;
        _system = OpenVR.Init(ref error, EVRApplicationType.VRApplication_Overlay);
        if (error != EVRInitError.None || _system is null)
        {
            Write(new { type = "error", error = $"SteamVR could not initialize: {error}" });
            return false;
        }
        _overlay = OpenVR.Overlay;
        if (_overlay is null)
        {
            Write(new { type = "error", error = "SteamVR's overlay service is unavailable." });
            return false;
        }
        if (!CreateOverlay("com.crewdeck.wrist", "CrewDeck Wrist", ref _wrist, .19f, 420, 180) ||
            !CreateOverlay("com.crewdeck.panel", "CrewDeck", ref _panel, 1.14f, 1280, 800))
            return false;

        PlacePanelInFrontOfHead();
        _overlay.ShowOverlay(_wrist);
        _overlay.HideOverlay(_panel);
        return true;
    }

    private static bool CreateOverlay(string key, string name, ref ulong handle, float width, float pixelsX, float pixelsY)
    {
        var result = _overlay!.CreateOverlay(key, name, ref handle);
        if (result == EVROverlayError.KeyInUse)
        {
            result = _overlay.FindOverlay(key, ref handle);
        }
        if (result != EVROverlayError.None)
        {
            Write(new { type = "error", error = $"SteamVR rejected {name}: {result}" });
            return false;
        }
        _overlay.SetOverlayWidthInMeters(handle, width);
        _overlay.SetOverlayInputMethod(handle, VROverlayInputMethod.Mouse);
        var mouse = new HmdVector2_t { v0 = pixelsX, v1 = pixelsY };
        _overlay.SetOverlayMouseScale(handle, ref mouse);
        _overlay.SetOverlayFlag(handle, VROverlayFlags.SendVRDiscreteScrollEvents, true);
        return true;
    }

    private static async Task ReadInputAsync(CancellationToken cancellationToken)
    {
        var stream = Console.OpenStandardInput();
        var header = new byte[16];
        while (!cancellationToken.IsCancellationRequested)
        {
            if (!await ReadExactlyAsync(stream, header, cancellationToken)) break;
            var magic = BitConverter.ToUInt32(header, 0);
            var kind = BitConverter.ToUInt32(header, 4);
            var width = BitConverter.ToUInt32(header, 8);
            var height = BitConverter.ToUInt32(header, 12);
            if (magic != Magic) break;
            var length = kind == CommandFrame ? checked((int)width) : checked((int)(width * height * 4));
            if (length < 0 || length > 64 * 1024 * 1024) break;
            var payload = new byte[length];
            if (!await ReadExactlyAsync(stream, payload, cancellationToken)) break;
            if (kind == CommandFrame) HandleCommand(Encoding.UTF8.GetString(payload));
            else if (kind is WristFrame or PanelFrame) SetFrame(kind, width, height, payload);
        }
        Stop.Cancel();
    }

    private static async Task<bool> ReadExactlyAsync(Stream stream, byte[] buffer, CancellationToken token)
    {
        var offset = 0;
        while (offset < buffer.Length)
        {
            var read = await stream.ReadAsync(buffer.AsMemory(offset), token);
            if (read == 0) return false;
            offset += read;
        }
        return true;
    }

    private static void SetFrame(uint kind, uint width, uint height, byte[] bgra)
    {
        for (var index = 0; index + 3 < bgra.Length; index += 4)
            (bgra[index], bgra[index + 2]) = (bgra[index + 2], bgra[index]);
        var pinned = GCHandle.Alloc(bgra, GCHandleType.Pinned);
        try
        {
            lock (VrLock)
                _overlay?.SetOverlayRaw(kind == WristFrame ? _wrist : _panel, pinned.AddrOfPinnedObject(), width, height, 4);
        }
        finally { pinned.Free(); }
    }

    private static void HandleCommand(string json)
    {
        try
        {
            using var document = JsonDocument.Parse(json);
            var root = document.RootElement;
            var type = root.GetProperty("type").GetString();
            lock (VrLock)
            {
                if (type == "show-panel")
                {
                    if (_panelAnchor == "world") PlacePanelInFrontOfHead(); else PositionPanel();
                    _overlay?.ShowOverlay(_panel);
                }
                else if (type == "hide-panel")
                {
                    _overlay?.HideOverlay(_panel);
                }
                else if (type == "set-hand")
                {
                    _hand = root.GetProperty("hand").GetString() == "right" ? "right" : "left";
                    PositionWrist();
                    Write(new { type = "hand", hand = _hand });
                }
                else if (type == "move-panel")
                {
                    MovePanel(root.GetProperty("dx").GetSingle() * .0012f, -root.GetProperty("dy").GetSingle() * .0012f);
                    PositionPanel();
                }
                else if (type == "reset-panel")
                {
                    PlacePanelInFrontOfHead();
                }
                else if (type == "set-anchor")
                {
                    _panelAnchor = root.GetProperty("anchor").GetString() is "wrist" or "headset" or "controller"
                        ? root.GetProperty("anchor").GetString()!
                        : "world";
                    if (_panelAnchor == "world") PlacePanelInFrontOfHead(); else PositionPanel();
                }
                else if (type == "haptic")
                {
                    var role = _hand == "right" ? ETrackedControllerRole.RightHand : ETrackedControllerRole.LeftHand;
                    var device = _system?.GetTrackedDeviceIndexForControllerRole(role) ?? OpenVR.k_unTrackedDeviceIndexInvalid;
                    if (device != OpenVR.k_unTrackedDeviceIndexInvalid)
                    {
                        var strength = root.TryGetProperty("strength", out var value) ? value.GetInt32() : 1800;
                        _system?.TriggerHapticPulse(device, 0, (ushort)Math.Clamp(strength, 100, 3999));
                    }
                }
            }
        }
        catch (Exception error) { Write(new { type = "warning", error = error.Message }); }
    }

    private static void PollEvents(ulong handle, string surface, int width, int height)
    {
        if (_overlay is null || handle == 0) return;
        var vrEvent = new VREvent_t();
        var size = (uint)Marshal.SizeOf<VREvent_t>();
        while (_overlay.PollNextOverlayEvent(handle, ref vrEvent, size))
        {
            var type = (EVREventType)vrEvent.eventType;
            if (type is EVREventType.VREvent_MouseMove or EVREventType.VREvent_MouseButtonDown or EVREventType.VREvent_MouseButtonUp)
            {
                var mouse = vrEvent.data.mouse;
                Write(new {
                    type = "mouse", surface,
                    action = type == EVREventType.VREvent_MouseMove ? "move" : type == EVREventType.VREvent_MouseButtonDown ? "down" : "up",
                    x = Math.Clamp((int)mouse.x, 0, width - 1),
                    y = Math.Clamp(height - (int)mouse.y, 0, height - 1),
                    button = mouse.button
                });
            }
            else if (type is EVREventType.VREvent_ScrollDiscrete or EVREventType.VREvent_ScrollSmooth)
            {
                Write(new { type = "scroll", surface, dx = vrEvent.data.scroll.xdelta, dy = vrEvent.data.scroll.ydelta });
            }
            else if (type is EVREventType.VREvent_Quit or EVREventType.VREvent_ProcessQuit)
            {
                Stop.Cancel();
            }
        }
    }

    private static void PositionWrist()
    {
        if (_system is null || _overlay is null || _wrist == 0) return;
        var role = _hand == "right" ? ETrackedControllerRole.RightHand : ETrackedControllerRole.LeftHand;
        var device = _system.GetTrackedDeviceIndexForControllerRole(role);
        if (device == OpenVR.k_unTrackedDeviceIndexInvalid) return;
        var side = _hand == "right" ? -.055f : .055f;
        var transform = Matrix(
            1, 0, 0, side,
            0, .35f, -.94f, .035f,
            0, .94f, .35f, -.035f);
        _overlay.SetOverlayTransformTrackedDeviceRelative(_wrist, device, ref transform);
    }

    private static void PositionPanel()
    {
        if (_system is null || _overlay is null || _panel == 0) return;
        if (_panelAnchor == "world")
        {
            _overlay.SetOverlayTransformAbsolute(_panel, ETrackingUniverseOrigin.TrackingUniverseStanding, ref _panelTransform);
            return;
        }
        if (_panelAnchor == "headset")
        {
            var headTransform = Matrix(1, 0, 0, 0, 0, 1, 0, -.03f, 0, 0, 1, -1.05f);
            _overlay.SetOverlayTransformTrackedDeviceRelative(_panel, HmdIndex, ref headTransform);
            return;
        }
        var role = _hand == "right" ? ETrackedControllerRole.RightHand : ETrackedControllerRole.LeftHand;
        var controller = _system.GetTrackedDeviceIndexForControllerRole(role);
        if (controller == OpenVR.k_unTrackedDeviceIndexInvalid) return;
        var side = _hand == "right" ? -.18f : .18f;
        var relative = _panelAnchor == "wrist"
            ? Matrix(1, 0, 0, side, 0, .35f, -.94f, .12f, 0, .94f, .35f, -.22f)
            : Matrix(1, 0, 0, side, 0, 1, 0, .04f, 0, 0, 1, -.55f);
        _overlay.SetOverlayTransformTrackedDeviceRelative(_panel, controller, ref relative);
    }

    private static void PlacePanelInFrontOfHead()
    {
        if (_system is null || _overlay is null) return;
        var poses = new TrackedDevicePose_t[OpenVR.k_unMaxTrackedDeviceCount];
        _system.GetDeviceToAbsoluteTrackingPose(ETrackingUniverseOrigin.TrackingUniverseStanding, 0, poses);
        if (!poses[HmdIndex].bPoseIsValid) return;
        _panelTransform = Multiply(poses[HmdIndex].mDeviceToAbsoluteTracking,
            Matrix(1, 0, 0, 0, 0, 1, 0, -.03f, 0, 0, 1, -1.05f));
        _panelAnchor = "world";
        PositionPanel();
    }

    private static void MovePanel(float x, float y)
    {
        _panelTransform.m3 += _panelTransform.m0 * x + _panelTransform.m1 * y;
        _panelTransform.m7 += _panelTransform.m4 * x + _panelTransform.m5 * y;
        _panelTransform.m11 += _panelTransform.m8 * x + _panelTransform.m9 * y;
    }

    private static HmdMatrix34_t Multiply(HmdMatrix34_t a, HmdMatrix34_t b) => Matrix(
        a.m0*b.m0+a.m1*b.m4+a.m2*b.m8, a.m0*b.m1+a.m1*b.m5+a.m2*b.m9, a.m0*b.m2+a.m1*b.m6+a.m2*b.m10, a.m0*b.m3+a.m1*b.m7+a.m2*b.m11+a.m3,
        a.m4*b.m0+a.m5*b.m4+a.m6*b.m8, a.m4*b.m1+a.m5*b.m5+a.m6*b.m9, a.m4*b.m2+a.m5*b.m6+a.m6*b.m10, a.m4*b.m3+a.m5*b.m7+a.m6*b.m11+a.m7,
        a.m8*b.m0+a.m9*b.m4+a.m10*b.m8, a.m8*b.m1+a.m9*b.m5+a.m10*b.m9, a.m8*b.m2+a.m9*b.m6+a.m10*b.m10, a.m8*b.m3+a.m9*b.m7+a.m10*b.m11+a.m11);

    private static void UpdateWristPoseAndFade()
    {
        if (_system is null || _overlay is null) return;
        PositionWrist();
        var role = _hand == "right" ? ETrackedControllerRole.RightHand : ETrackedControllerRole.LeftHand;
        var controller = _system.GetTrackedDeviceIndexForControllerRole(role);
        if (controller == OpenVR.k_unTrackedDeviceIndexInvalid) return;
        var poses = new TrackedDevicePose_t[OpenVR.k_unMaxTrackedDeviceCount];
        _system.GetDeviceToAbsoluteTrackingPose(ETrackingUniverseOrigin.TrackingUniverseStanding, 0, poses);
        if (!poses[HmdIndex].bPoseIsValid || !poses[controller].bPoseIsValid) return;
        var head = poses[HmdIndex].mDeviceToAbsoluteTracking;
        var hand = poses[controller].mDeviceToAbsoluteTracking;
        var dx = hand.m3 - head.m3; var dy = hand.m7 - head.m7; var dz = hand.m11 - head.m11;
        var length = MathF.Max(.001f, MathF.Sqrt(dx * dx + dy * dy + dz * dz));
        dx /= length; dy /= length; dz /= length;
        var forwardX = -head.m2; var forwardY = -head.m6; var forwardZ = -head.m10;
        var gaze = dx * forwardX + dy * forwardY + dz * forwardZ;
        var target = gaze > .73f ? 1f : .06f;
        _wristAlpha += (target - _wristAlpha) * .12f;
        _overlay.SetOverlayAlpha(_wrist, _wristAlpha);
    }

    private static HmdMatrix34_t Matrix(float m0, float m1, float m2, float m3, float m4, float m5, float m6, float m7, float m8, float m9, float m10, float m11) =>
        new() { m0 = m0, m1 = m1, m2 = m2, m3 = m3, m4 = m4, m5 = m5, m6 = m6, m7 = m7, m8 = m8, m9 = m9, m10 = m10, m11 = m11 };

    private static void Write(object value)
    {
        try { Console.WriteLine(JsonSerializer.Serialize(value)); Console.Out.Flush(); } catch { }
    }

    private static void Shutdown()
    {
        lock (VrLock)
        {
            try { if (_overlay is not null && _wrist != 0) _overlay.DestroyOverlay(_wrist); } catch { }
            try { if (_overlay is not null && _panel != 0) _overlay.DestroyOverlay(_panel); } catch { }
            _wrist = 0; _panel = 0;
            try { OpenVR.Shutdown(); } catch { }
        }
    }
}
