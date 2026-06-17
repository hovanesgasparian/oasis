import { useState } from 'react';
import { useTheme } from 'next-themes';
import { Button } from '@databricks/appkit-ui/react';
import { Database, Leaf, Monitor, Moon, Sun } from 'lucide-react';
import { CareFinderPage } from './CareFinderPage';

type AppTab = 'genie' | 'care-finder';

const tabs: Array<{ id: AppTab; label: string }> = [
  { id: 'care-finder', label: 'Care Compass' },
  { id: 'genie', label: 'Survey Says' },
];

const themeOrder = ['light', 'dark', 'green', 'databricks', 'system'] as const;

const themeIcons = {
  light: Sun,
  dark: Moon,
  green: Leaf,
  databricks: Database,
  system: Monitor,
} as const;

function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const currentTheme = (theme ?? 'system') as (typeof themeOrder)[number];
  const currentIndex = themeOrder.indexOf(currentTheme);
  const next = themeOrder[(currentIndex + 1) % themeOrder.length];
  const Icon = themeIcons[currentTheme] ?? Monitor;

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(next)}
      title={`Theme: ${currentTheme} (click for ${next})`}
    >
      <Icon className="h-5 w-5" />
      <span className="sr-only">Toggle theme</span>
    </Button>
  );
}

function GenieSpacePage() {
  return (
    <section className="h-[calc(100vh-8.5rem)] min-h-[520px]" aria-label="Genie Space">
      <iframe
        src="https://dbc-ee0ead6d-c943.cloud.databricks.com/embed/genie/rooms/01f168ebcf2c14e892b5843e00a085d6?o=7474659736703581"
        width="100%"
        height="600"
        frameBorder="0"
        allow="clipboard-write"
        className="h-full w-full border-0"
        title="Databricks Genie"
      />
    </section>
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState<AppTab>('care-finder');

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="flex flex-col gap-3 border-b px-4 py-3 md:flex-row md:items-center md:px-6">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold text-foreground">oasis</h1>
        </div>
        <nav className="flex w-full gap-1 overflow-x-auto md:w-auto" role="tablist" aria-label="Application sections">
          {tabs.map((tab) => {
            const isActive = tab.id === activeTab;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                className={`whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            );
          })}
        </nav>
        <div className="absolute right-3 top-2 md:static md:ml-auto">
          <ThemeToggle />
        </div>
      </header>

      <main className="flex-1 p-4 md:p-6">{activeTab === 'genie' ? <GenieSpacePage /> : <CareFinderPage />}</main>
    </div>
  );
}
