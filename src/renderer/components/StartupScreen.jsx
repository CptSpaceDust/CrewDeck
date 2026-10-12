import BrandMark from "./BrandMark";

export default function StartupScreen() {
  return (
    <main
      className="startup-screen"
      role="status"
      aria-live="polite"
      aria-label="CrewDeck is starting"
    >
      <div className="startup-grid" aria-hidden="true" />
      <div className="startup-glow startup-glow-one" aria-hidden="true" />
      <div className="startup-glow startup-glow-two" aria-hidden="true" />
      <div className="startup-starflight" aria-hidden="true">
        {Array.from({ length: 14 }, (_, index) => (
          <i key={index} style={{ "--star": index }} />
        ))}
      </div>
      <section className="startup-animation" aria-hidden="true">
        <i className="startup-launch-wave startup-launch-wave-one" />
        <i className="startup-launch-wave startup-launch-wave-two" />
        <i className="startup-launch-wave startup-launch-wave-three" />
        <div className="startup-mark">
          <i className="startup-ring startup-ring-one" />
          <i className="startup-ring startup-ring-two" />
          <i className="startup-node startup-node-one" />
          <i className="startup-node startup-node-two" />
          <i className="startup-node startup-node-three" />
          <span>
            <BrandMark />
          </span>
        </div>
      </section>
    </main>
  );
}