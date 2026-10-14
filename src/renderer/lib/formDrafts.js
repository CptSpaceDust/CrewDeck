import { useCallback } from "react";

const prefix = "crewdeck.form-draft.v1";

export function useFormDraft(userId, name, enabled = true) {
  const key = `${prefix}.${userId}.${name}`;
  const restore = useCallback(
    (form) => {
      if (!form || !enabled || form.dataset.draftRestored) return;
      form.dataset.draftRestored = "true";
      try {
        const values = JSON.parse(localStorage.getItem(key) || "{}");
        for (const [field, value] of Object.entries(values)) {
          const control = form.elements.namedItem(field);
          if (!control || control.type === "file") continue;
          if (control.type === "checkbox") control.checked = Boolean(value);
          else control.value = value;
        }
      } catch {}
    },
    [key, enabled],
  );
  const save = useCallback(
    (event) => {
      if (!enabled) return;
      const values = {};
      for (const control of event.currentTarget.elements) {
        if (!control.name || control.type === "file" || control.type === "submit") continue;
        values[control.name] = control.type === "checkbox" ? control.checked : control.value;
      }
      localStorage.setItem(key, JSON.stringify(values));
    },
    [key, enabled],
  );
  const clear = useCallback(() => localStorage.removeItem(key), [key]);
  return { ref: restore, onInput: save, onChange: save, clear };
}

