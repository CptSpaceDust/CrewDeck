import { useEffect, useState } from "react";
import { ArrowBigUp, CornerDownLeft, Delete, Space, X } from "lucide-react";

const rows = [
  ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"],
  ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"],
  ["a", "s", "d", "f", "g", "h", "j", "k", "l"],
  ["z", "x", "c", "v", "b", "n", "m", ".", "?", "!"],
];

function replaceSelection(target, text) {
  const start = target.selectionStart ?? target.value.length;
  const end = target.selectionEnd ?? start;
  const next = `${target.value.slice(0, start)}${text}${target.value.slice(end)}`;
  const descriptor = Object.getOwnPropertyDescriptor(
    target.tagName === "TEXTAREA"
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype,
    "value",
  );
  descriptor?.set?.call(target, next);
  target.dispatchEvent(new Event("input", { bubbles: true }));
  target.focus();
  target.setSelectionRange(start + text.length, start + text.length);
}

export default function VrKeyboard() {
  const [target, setTarget] = useState(null);
  const [shift, setShift] = useState(false);
  useEffect(() => {
    const focus = (event) => {
      const element = event.target;
      if (
        element instanceof HTMLTextAreaElement ||
        (element instanceof HTMLInputElement &&
          !["checkbox", "radio", "range", "button", "submit"].includes(
            element.type,
          ))
      )
        setTarget(element);
    };
    document.addEventListener("focusin", focus);
    return () => document.removeEventListener("focusin", focus);
  }, []);
  if (!target) return null;
  const type = (key) => {
    replaceSelection(target, shift ? key.toUpperCase() : key);
    if (shift) setShift(false);
  };
  const backspace = () => {
    const start = target.selectionStart ?? 0;
    const end = target.selectionEnd ?? start;
    if (start !== end) replaceSelection(target, "");
    else if (start > 0) {
      target.setSelectionRange(start - 1, end);
      replaceSelection(target, "");
    }
  };
  const enter = () => {
    if (target instanceof HTMLTextAreaElement) replaceSelection(target, "\n");
    else
      target.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Enter",
          code: "Enter",
          bubbles: true,
        }),
      );
  };
  return (
    <aside className="vr-keyboard" aria-label="VR keyboard">
      <div className="vr-keyboard-grip">
        <span>Keyboard</span>
        <button
          onClick={() => {
            target.blur();
            setTarget(null);
          }}
        >
          <X />
        </button>
      </div>
      {rows.map((row, index) => (
        <div className="vr-keyboard-row" key={index}>
          {row.map((key) => (
            <button key={key} onClick={() => type(key)}>
              {shift ? key.toUpperCase() : key}
            </button>
          ))}
        </div>
      ))}
      <div className="vr-keyboard-row controls">
        <button
          className={shift ? "active" : ""}
          onClick={() => setShift((value) => !value)}
        >
          <ArrowBigUp />
        </button>
        <button className="space" onClick={() => replaceSelection(target, " ")}>
          <Space />
        </button>
        <button onClick={backspace}>
          <Delete />
        </button>
        <button onClick={enter}>
          <CornerDownLeft />
        </button>
      </div>
    </aside>
  );
}
