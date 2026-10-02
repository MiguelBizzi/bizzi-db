import { useState } from 'react';
import { ShowcaseNavbar } from './ShowcaseNavbar';
import { ShowcaseSidebar } from './ShowcaseSidebar';
import { ShowcaseTabsBar } from './ShowcaseTabsBar';
import { ShowcaseGrid } from './ShowcaseGrid';
import { ShowcaseSql } from './ShowcaseSql';
import { ShowcaseErd } from './ShowcaseErd';
import type { ShowcaseTab } from './showcaseTabs';

export function ProductShowcase() {
  const [activeTab, setActiveTab] = useState<ShowcaseTab>('grid');

  return (
    <div className="relative w-full max-w-6xl mx-auto">
      <div className="absolute -inset-1 bg-gradient-to-r from-primary/25 to-primary/5 rounded-3xl blur-2xl opacity-70 pointer-events-none" />
      <div className="relative rounded-2xl border border-border bg-card/95 shadow-2xl overflow-hidden flex flex-col h-[520px] sm:h-[560px]">
        <ShowcaseNavbar />
        <div className="flex-1 flex min-h-0">
          <ShowcaseSidebar onOpenErd={() => setActiveTab('erd')} />
          <div className="flex-1 flex flex-col min-w-0 min-h-0 bg-background">
            <ShowcaseTabsBar
              activeTab={activeTab}
              onSelectTab={setActiveTab}
            />
            {activeTab === 'grid' && <ShowcaseGrid />}
            {activeTab === 'sql' && <ShowcaseSql />}
            {activeTab === 'erd' && <ShowcaseErd />}
          </div>
        </div>
      </div>
    </div>
  );
}
