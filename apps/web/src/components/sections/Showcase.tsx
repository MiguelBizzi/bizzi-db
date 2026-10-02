import { ProductShowcase } from '../showcase/ProductShowcase';

export function Showcase() {
  return (
    <section id="showcase" className="pb-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center space-y-2 mb-6">
          <h2 className="text-xs uppercase tracking-widest font-mono text-primary font-bold">
            Product showcase
          </h2>
          <p className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
            The same workspace as the desktop app
          </p>
          <p className="text-sm text-muted-foreground max-w-xl mx-auto">
            Explorer, tabs, SQL editor, and table grid — a preview of the Tauri
            UI, not a browser database client.
          </p>
        </div>
        <ProductShowcase />
      </div>
    </section>
  );
}
