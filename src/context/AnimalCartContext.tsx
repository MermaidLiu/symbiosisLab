"use client";

import { createContext, useCallback, useContext, useState } from "react";

interface AnimalCartContextValue {
  items: string[];
  addItems: (ids: string[]) => void;
  removeItem: (id: string) => void;
  clear: () => void;
  count: number;
}

const AnimalCartContext = createContext<AnimalCartContextValue | null>(null);

export function AnimalCartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<string[]>([]);

  const addItems = useCallback((ids: string[]) => {
    setItems((prev) => [...new Set([...prev, ...ids])]);
  }, []);

  const removeItem = useCallback((id: string) => {
    setItems((prev) => prev.filter((x) => x !== id));
  }, []);

  const clear = useCallback(() => setItems([]), []);

  return (
    <AnimalCartContext.Provider
      value={{ items, addItems, removeItem, clear, count: items.length }}
    >
      {children}
    </AnimalCartContext.Provider>
  );
}

export function useAnimalCart() {
  const ctx = useContext(AnimalCartContext);
  if (!ctx) throw new Error("useAnimalCart must be used within AnimalCartProvider");
  return ctx;
}
