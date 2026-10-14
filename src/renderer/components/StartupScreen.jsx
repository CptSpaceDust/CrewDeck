import BrandMark from "./BrandMark";

export default function StartupScreen() {
  return (
    <main
      className="startup-screen"
      role="status"
      aria-live="polite"
      aria-label="CrewDeck is starting"
    >
      <div className="startup-horizon" aria-hidden="true" />
      <section className="startup-sequence" aria-hidden="true">
        <div className="startup-brand-frame">
          <BrandMark />
        </div>
        <div className="startup-scan-line" />
        <div className="startup-progress">
          <i />
          <i />
          <i />
          <i />
          <i />
        </div>
      </section>
    </main>
  );
}
