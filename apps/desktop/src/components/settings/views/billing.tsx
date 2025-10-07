import { Shield } from "lucide-react";

import { Card } from "@hypr/ui/components/ui/card";

export default function Billing() {
  // License checking removed - all features now unlimited

  return (
    <div className="w-full max-w-2xl mx-auto">
      <Card className="p-6 sm:p-8">
        <UnlimitedSection />
      </Card>
    </div>
  );
}

function SectionContainer({ title, subtitle, headerAction, children }: {
  title: string;
  subtitle?: string;
  headerAction?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <>
      <div className="flex items-center justify-between pb-5">
        <div className="flex items-center space-x-3.5">
          <div className="p-2 rounded-full bg-primary/10 shadow-sm">
            <Shield className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h2 className="text-2xl font-semibold tracking-tight text-foreground">
              {title}
            </h2>
            {subtitle && (
              <p className="text-sm text-muted-foreground mt-1">
                {subtitle}
              </p>
            )}
          </div>
        </div>
        {headerAction}
      </div>
      {children}
    </>
  );
}

function UnlimitedSection() {
  return (
    <SectionContainer
      title="AI Consul"
      subtitle="All features are now available to all users"
    >
      
      <div className="space-y-4 mt-6">
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex items-start space-x-3">
            <Shield className="w-5 h-5 text-green-600 mt-0.5" />
            <div>
              <h3 className="font-medium text-green-800">All Features Unlocked</h3>
              <p className="text-sm text-green-700 mt-1">
                Enjoy unlimited access to all Pinote features including:
              </p>
              <ul className="text-sm text-green-700 mt-2 space-y-1">
                <li>• Unlimited chat messages with AI</li>
                <li>• Unlimited custom templates</li>
                <li>• Template duplication</li>
                <li>• Advanced STT models</li>
                <li>• HyprCloud AI models</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </SectionContainer>
  );
}