import { createContext, useContext } from "react";

export const DmsSessionContext = createContext(null);

export function useDmsSessionContext() {
  return useContext(DmsSessionContext);
}
