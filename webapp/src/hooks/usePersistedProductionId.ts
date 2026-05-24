import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "ordo.productionPlanner.selectedProductionId";

export function usePersistedProductionId() {
  const [productionId, setProductionIdState] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw && raw.length > 0 ? raw : null;
  });

  const setProductionId = useCallback((id: string | null) => {
    setProductionIdState(id);
    if (id) window.localStorage.setItem(STORAGE_KEY, id);
    else window.localStorage.removeItem(STORAGE_KEY);
  }, []);

  return { productionId, setProductionId };
}

/** When the productions list loads, ensure a valid selection exists. */
export function useSyncProductionSelection(
  productionId: string | null,
  setProductionId: (id: string | null) => void,
  productionIds: string[]
) {
  useEffect(() => {
    if (productionIds.length === 0) {
      if (productionId) setProductionId(null);
      return;
    }
    if (!productionId || !productionIds.includes(productionId)) {
      setProductionId(productionIds[0]!);
    }
  }, [productionId, productionIds, setProductionId]);
}
