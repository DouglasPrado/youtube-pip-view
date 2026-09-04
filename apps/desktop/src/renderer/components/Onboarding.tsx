import { Keyboard, ListOrdered, MousePointerClick } from "lucide-react";
import { strings } from "../strings";

interface OnboardingProps {
  onDismiss: () => void;
}

/**
 * Primeira abertura. A janela não tem moldura, some do alternador de apps e os
 * controles só aparecem no hover — sem uma apresentação, nada disso é
 * descoberto.
 */
export function Onboarding({ onDismiss }: OnboardingProps) {
  return (
    <div className="onboarding-overlay">
      <div className="onboarding-card">
        <h1 className="onboarding-title">{strings.onboarding.title}</h1>

        <ul className="onboarding-list">
          <li>
            <MousePointerClick size={16} aria-hidden="true" />
            <span>{strings.onboarding.click}</span>
          </li>
          <li>
            <Keyboard size={16} aria-hidden="true" />
            <span>
              <kbd>⌘⇧Y</kbd> {strings.onboarding.shortcuts} <kbd>⌘L</kbd>{" "}
              {strings.onboarding.shortcutsChange}
            </span>
          </li>
          <li>
            <ListOrdered size={16} aria-hidden="true" />
            <span>{strings.onboarding.queue}</span>
          </li>
        </ul>

        <button
          type="button"
          className="onboarding-button"
          onClick={onDismiss}
          autoFocus
        >
          {strings.onboarding.start}
        </button>
      </div>
    </div>
  );
}
