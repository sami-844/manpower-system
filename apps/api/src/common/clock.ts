export const CLOCK = Symbol("CLOCK");

export interface Clock {
  /** Today's calendar date in Oman (YYYY-MM-DD). */
  today(): string;
}

export const omanClock: Clock = {
  today: () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Muscat" }).format(new Date()),
};
