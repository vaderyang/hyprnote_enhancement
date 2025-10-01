import PushableButton from "@hypr/ui/components/ui/pushable-button";
import { TextAnimate } from "@hypr/ui/components/ui/text-animate";
import { Trans, useLingui } from "@lingui/react/macro";
import React from "react";

interface WelcomeViewProps {
  portReady: boolean;
  onGetStarted: () => void;
}

export const WelcomeView: React.FC<WelcomeViewProps> = ({ portReady, onGetStarted }) => {
  const { t } = useLingui();

  return (
    <div className="flex flex-col items-center">
      <div className="mb-6 text-8xl font-bold tracking-tight text-neutral-800">
        PINOTE
      </div>

      <TextAnimate
        animation="slideUp"
        by="word"
        once
        className="mb-20 text-center text-2xl font-medium text-neutral-600"
      >
        {t`Wisdom from conversations`}
      </TextAnimate>

      <PushableButton
        disabled={!portReady}
        onClick={onGetStarted}
        className="w-full max-w-sm"
      >
        <Trans>Get Started</Trans>
      </PushableButton>
    </div>
  );
};
