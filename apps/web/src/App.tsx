import { Header } from './components/layout/Header';
import { Footer } from './components/layout/Footer';
import { Hero } from './components/sections/Hero';
import { Showcase } from './components/sections/Showcase';
import { Databases } from './components/sections/Databases';
import { Pillars } from './components/sections/Pillars';
import { Features } from './components/sections/Features';
import { Architecture } from './components/sections/Architecture';
import { Changelog } from './components/sections/Changelog';
import { Testimonials } from './components/sections/Testimonials';
import { Faq } from './components/sections/Faq';
import { Cta } from './components/sections/Cta';

export default function App() {
  return (
    <div
      id="top"
      className="min-h-screen bg-background text-foreground antialiased"
    >
      <Header />
      <main>
        <Hero />
        <Showcase />
        <Databases />
        <Pillars />
        <Features />
        <Architecture />
        <Changelog />
        {/* Testimonials are commented in Testimonials.tsx — do not delete. */}
        <Testimonials />
        <Faq />
        <Cta />
      </main>
      <Footer />
    </div>
  );
}
