
'use client';

import { useState, useEffect, useRef } from 'react';
import { ref, onValue, off, DatabaseReference, DataSnapshot, Query } from 'firebase/database';

export function useDbData<T = any>(query: DatabaseReference | Query | null): [T | null, boolean] {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);

  // Using a ref to store the string representation of the query path
  // to avoid re-running the effect if the query object reference changes
  // but the actual path is the same.
  const queryPathRef = useRef<string | null>(null);
  const currentQueryPath = query ? query.toString() : null;

  useEffect(() => {
    if (currentQueryPath === null) {
      setData(null);
      setLoading(false);
      return;
    }

    // Only set loading to true if the query path has actually changed.
    if (queryPathRef.current !== currentQueryPath) {
      setLoading(true);
      setData(null); // Clear old data when query changes
      queryPathRef.current = currentQueryPath;
    }

    
    const handleValue = (snapshot: DataSnapshot) => {
      setData(snapshot.val());
      setLoading(false);
    };
    
    // query is guaranteed to be non-null here because currentQueryPath is non-null
    const queryRef = query!;

    onValue(queryRef, handleValue, (error) => {
      console.error(error);
      setData(null);
      setLoading(false);
    });

    return () => {
      off(queryRef, 'value', handleValue);
    };
    // We use currentQueryPath in the dependency array as it's a stable string primitive
  }, [currentQueryPath, query]);

  return [data, loading];
}
