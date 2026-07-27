'use client';

import { createContext, useContext, useState } from 'react';
import type { Branding } from '@/lib/server/settings';

const BrandingContext = createContext<{
  branding: Branding;
  setBranding: (b: Branding) => void;
}>({
  branding: { studioName: 'Filio', accentHue: 78, logoUrl: null },
  setBranding: () => {},
});

export function BrandingProvider({
  value,
  children,
}: {
  value: Branding;
  children: React.ReactNode;
}) {
  const [branding, setBranding] = useState(value);
  return (
    <BrandingContext.Provider value={{ branding, setBranding }}>
      <div className="brandRoot" style={{ ['--accent-h' as string]: branding.accentHue }}>
        {children}
      </div>
    </BrandingContext.Provider>
  );
}

export function useBranding() {
  return useContext(BrandingContext);
}

// Het studiologo, of de gestreepte placeholder zolang er geen logo is.
export default function Brand({ size = 26 }: { size?: number }) {
  const { branding } = useBranding();
  if (branding.logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        className="brandLogo"
        src={branding.logoUrl}
        alt={branding.studioName}
        style={{ width: size, height: size }}
      />
    );
  }
  return <div className="logoSq" style={{ width: size, height: size }} />;
}
