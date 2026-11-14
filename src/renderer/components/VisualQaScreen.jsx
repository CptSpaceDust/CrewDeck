import { AvailabilityOverlap } from "./AvailabilityOverlap";
import PhysicalAccessKey from "./PhysicalAccessKey";
import PrivacyCover from "./PrivacyCover";
import "../captain.css";

export default function VisualQaScreen({ view }) {
  if (view === "privacy-cover") return <PrivacyCover />;
  if (view === "physical-key")
    return (
      <main className="page captain-page">
        <section className="calendar-container">
          <span className="eyebrow">Captain security</span>
          <h1 className="calendar-title">Physical App Access Key</h1>
          <p>Turn one removable drive into your private local unlock key.</p>
          <PhysicalAccessKey />
        </section>
      </main>
    );
  const date = new Date().toISOString().slice(0, 10);
  return (
    <main className="page visual-qa-planner">
      <AvailabilityOverlap
        participantIds={["captain", "member"]}
        profiles={[
          { id: "captain", username: "CptSpaceDust" },
          { id: "member", username: "LogieVR" },
        ]}
        availability={[
          {
            user_id: "captain",
            block_date: date,
            all_day: false,
            start_time: "19:00",
            end_time: "23:00",
            time_zone: "America/Denver",
          },
        ]}
        meetups={[]}
        duration={1}
        minimumAttendance={2}
        selectedDate={date}
        onUseTime={() => {}}
        userId=""
      />
    </main>
  );
}
