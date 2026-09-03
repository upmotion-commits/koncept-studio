"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import type { Icon as TablerIcon } from '@tabler/icons-react';

interface Tab {
  title: string;
  icon: TablerIcon;
  href?: string;
  type?: never;
}

interface Separator {
  type: "separator";
  title?: never;
  icon?: never;
}

type TabItem = Tab | Separator;

interface ExpandableTabsProps {
  tabs: TabItem[];
  className?: string;
  activeColor?: string;
  activeIndex?: number | null;
  onChange?: (index: number | null, tab?: Tab) => void;
}

export function ExpandableTabs({
  tabs,
  className,
  activeColor = "text-primary",
  activeIndex,
  onChange,
}: ExpandableTabsProps) {
  const [selected, setSelected] = useState<number | null>(activeIndex ?? null);

  // Update selected when activeIndex changes
  useEffect(() => {
    setSelected(activeIndex ?? null);
  }, [activeIndex]);

  const handleSelect = (index: number) => {
    const tab = tabs[index];
    if (tab.type === "separator") return;

    setSelected(index);
    onChange?.(index, tab);
  };

  const Separator = () => (
    <div className="mx-1 h-[24px] w-[1.2px] bg-border" aria-hidden="true" />
  );

  return (
    <nav
      aria-label="Navigation de l'espace membre"
      className={cn(
        "flex items-center gap-2 w-full",
        className
      )}
    >
      {tabs.map((tab, index) => {
        if (tab.type === "separator") {
          return <Separator key={`separator-${index}`} />;
        }

        const tabItem = tab as Tab;
        const Icon = tabItem.icon;
        const isActive = selected === index;

        return (
          <motion.button
            key={`tab-${index}-${tabItem.title}`}
            type="button"
            layout
            aria-current={isActive ? "page" : undefined}
            aria-label={tabItem.title}
            className={cn(
              "flex items-center justify-center rounded-xl cursor-pointer overflow-hidden h-[44px] relative",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              isActive
                ? "bg-primary text-primary-foreground shadow-md"
                : "bg-muted/60 hover:bg-muted/80 text-muted-foreground hover:text-foreground"
            )}
            onClick={() => handleSelect(index)}
            initial={false}
            animate={{
              flex: isActive ? "1 1 auto" : "0 0 44px",
              width: isActive ? "auto" : 44,
            }}
            transition={{
              type: "spring",
              stiffness: 500,
              damping: 35,
              mass: 0.8,
            }}
          >
            <motion.div
              className={cn(
                "flex items-center justify-center h-[44px] w-full",
                isActive ? "px-2" : "px-3"
              )}
              layout
            >
              <Icon className="flex-shrink-0 w-5 h-5" />
              <AnimatePresence mode="wait">
                {isActive && (
                  <motion.span
                    className="ml-2 font-medium text-sm whitespace-nowrap overflow-hidden"
                    initial={{ opacity: 0, width: 0 }}
                    animate={{ opacity: 1, width: "auto" }}
                    exit={{ opacity: 0, width: 0 }}
                    transition={{
                      duration: 0.3,
                      ease: "easeOut",
                      width: { type: "spring", stiffness: 300, damping: 25 }
                    }}
                  >
                    {tabItem.title}
                  </motion.span>
                )}
              </AnimatePresence>
            </motion.div>
          </motion.button>
        );
      })}
    </nav>
  );
}