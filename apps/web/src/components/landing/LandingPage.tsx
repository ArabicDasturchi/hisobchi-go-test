import { FinalCta, Footer } from './Footer';
import { Header } from './Header';
import { Hero } from './Hero';
import { Benefits, Faq, Problem, Sheet, Steps } from './Sections';

export function LandingPage() {
  return (
    <div className="landing">
      <a
        href="#asosiy"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2"
      >
        Asosiy qismga o&apos;tish
      </a>
      <Header />
      <main id="asosiy">
        <Hero />
        <Problem />
        <Benefits />
        <Steps />
        <Sheet />
        <Faq />
        <FinalCta />
      </main>
      <Footer />
    </div>
  );
}
