import { Navbar } from '@/components/landing/Navbar';
import { AnnouncementPill } from '@/components/landing/AnnouncementPill';
import { HeroSection } from '@/components/landing/HeroSection';
import { ProductPreview } from '@/components/landing/ProductPreview';
import { FeaturesSection } from '@/components/landing/FeaturesSection';
import { Footer } from '@/components/landing/Footer';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#0F1222] text-slate-100">
      <Navbar />
      <main>
        <AnnouncementPill />
        <HeroSection />
        <ProductPreview />
        <FeaturesSection />
      </main>
      <Footer />
    </div>
  );
}
