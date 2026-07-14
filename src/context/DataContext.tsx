"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { Instrument, Animal, Booking, BookingStatus } from "@/types";
import { api } from "@/lib/api/client";
import {
  getInstruments,
  getAnimals,
  getBookings,
  hydrateFromApi,
  setCachePartial,
} from "@/lib/storage/db";
import { useAuth } from "@/context/AuthContext";

interface DataContextValue {
  instruments: Instrument[];
  animals: Animal[];
  bookings: Booking[];
  refresh: () => Promise<void>;
  addInstrument: (data: Omit<Instrument, "id" | "createdAt" | "updatedAt">) => Promise<Instrument>;
  updateInstrument: (id: string, data: Partial<Instrument>) => Promise<void>;
  deleteInstrument: (id: string) => Promise<void>;
  addAnimal: (data: Omit<Animal, "id" | "createdAt" | "updatedAt">) => Promise<Animal>;
  updateAnimal: (id: string, data: Partial<Animal>) => Promise<void>;
  deleteAnimal: (id: string) => Promise<void>;
  createBooking: (
    data: Omit<Booking, "id" | "createdAt" | "status">
  ) => Promise<{ ok: boolean; error?: string; booking?: Booking }>;
  updateBookingStatus: (id: string, status: BookingStatus) => Promise<void>;
}

const DataContext = createContext<DataContextValue | null>(null);

export function DataProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [instruments, setInstruments] = useState<Instrument[]>([]);
  const [animals, setAnimals] = useState<Animal[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);

  const syncFromCache = useCallback(() => {
    setInstruments(getInstruments());
    setAnimals(getAnimals());
    setBookings(getBookings());
  }, []);

  const refresh = useCallback(async () => {
    if (!user) {
      setInstruments([]);
      setAnimals([]);
      setBookings([]);
      return;
    }
    await hydrateFromApi();
    syncFromCache();
  }, [user, syncFromCache]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const addInstrument = useCallback(
    async (data: Omit<Instrument, "id" | "createdAt" | "updatedAt">) => {
      const { instrument } = await api.createInstrument(data);
      const all = [...getInstruments(), instrument];
      setCachePartial({ instruments: all });
      setInstruments(all);
      return instrument;
    },
    []
  );

  const updateInstrument = useCallback(async (id: string, data: Partial<Instrument>) => {
    const { instrument } = await api.updateInstrument(id, data);
    const all = getInstruments().map((i) => (i.id === id ? instrument : i));
    setCachePartial({ instruments: all });
    setInstruments(all);
  }, []);

  const deleteInstrument = useCallback(async (id: string) => {
    await api.deleteInstrument(id);
    const all = getInstruments().filter((i) => i.id !== id);
    setCachePartial({ instruments: all });
    setInstruments(all);
  }, []);

  const addAnimal = useCallback(async (data: Omit<Animal, "id" | "createdAt" | "updatedAt">) => {
    const { animal } = await api.createAnimal(data);
    const all = [...getAnimals(), animal];
    setCachePartial({ animals: all });
    setAnimals(all);
    return animal;
  }, []);

  const updateAnimal = useCallback(async (id: string, data: Partial<Animal>) => {
    const { animal } = await api.updateAnimal(id, data);
    const all = getAnimals().map((a) => (a.id === id ? animal : a));
    setCachePartial({ animals: all });
    setAnimals(all);
  }, []);

  const deleteAnimal = useCallback(async (id: string) => {
    await api.deleteAnimal(id);
    const all = getAnimals().filter((a) => a.id !== id);
    setCachePartial({ animals: all });
    setAnimals(all);
  }, []);

  const createBooking = useCallback(
    async (data: Omit<Booking, "id" | "createdAt" | "status">) => {
      try {
        const { booking } = await api.createBooking(data);
        const all = [...getBookings(), booking];
        setCachePartial({ bookings: all });
        setBookings(all);
        await hydrateFromApi();
        syncFromCache();
        return { ok: true, booking };
      } catch (e) {
        const code = (e as { code?: string }).code;
        return { ok: false, error: code ?? "failed" };
      }
    },
    [syncFromCache]
  );

  const updateBookingStatus = useCallback(async (id: string, status: BookingStatus) => {
    const { bookings: all } = await api.updateBookingStatus(id, status);
    setCachePartial({ bookings: all });
    setBookings(all);
  }, []);

  return (
    <DataContext.Provider
      value={{
        instruments,
        animals,
        bookings,
        refresh,
        addInstrument,
        updateInstrument,
        deleteInstrument,
        addAnimal,
        updateAnimal,
        deleteAnimal,
        createBooking,
        updateBookingStatus,
      }}
    >
      {children}
    </DataContext.Provider>
  );
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error("useData must be used within DataProvider");
  return ctx;
}
