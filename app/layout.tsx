import type { Metadata } from 'next';
import { BrandingProvider } from '@/components/Branding';
import { getBranding } from '@/lib/server/settings';
import './globals.css';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const { studioName } = await getBranding();
  return {
    title: `${studioName} — Video review`,
    description: 'Feedback op de frame, zonder account',
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const branding = await getBranding();
  return (
    <html lang="nl">
      <body>
        {/* Zet de interface-grootte vóór het renderen: opgeslagen keuze, anders
            een schatting op basis van de schermbreedte. Voorkomt een sprong. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var s=localStorage.getItem('filio-ui-scale');if(!s){var w=window.innerWidth;s=w>=2400?1.35:w>=1900?1.2:w>=1500?1.1:1}document.documentElement.style.setProperty('--zoom',s)}catch(e){}})()`,
          }}
        />
        <BrandingProvider value={branding}>{children}</BrandingProvider>
      </body>
    </html>
  );
}
