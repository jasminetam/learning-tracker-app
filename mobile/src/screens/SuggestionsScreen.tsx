import React, { useEffect, useMemo, useState } from "react";
import { View, Text, Button, StyleSheet, FlatList } from "react-native";
import { useAuth } from "../auth/AuthContext";
import { apiFetch } from "../api/client";
import { getUserIdFromToken } from "../auth/getUserId";

type Resource = {
  resourceId: string;
  title: string;
  type: string;
  status: "active" | "completed";
  minutesSpent: number;
};

type Suggestion = {
  title: string;
  type: "course" | "book" | "video" | "article";
  reason: string;
};

type SuggestionsResp = {
  userId: string;
  suggestions: Suggestion[];
};

export default function SuggestionsScreen() {
  const { token } = useAuth();
  const userId = getUserIdFromToken(token);

  const [resources, setResources] = useState<Resource[] | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFetchedAt, setLastFetchedAt] = useState<number | null>(null);

  // simple in-memory cache TTL (10 mins)
  const CACHE_TTL_MS = 10 * 60 * 1000;

  const canUseCache = useMemo(() => {
    if (!lastFetchedAt || !suggestions) return false;
    return Date.now() - lastFetchedAt < CACHE_TTL_MS;
  }, [lastFetchedAt, suggestions]);

  useEffect(() => {
    loadResources();
    // auto-fetch suggestions once resources loaded
  }, []);

  useEffect(() => {
    if (resources) fetchSuggestions(false);
  }, [resources]);

  async function loadResources() {
    try {
      const data = await apiFetch<{ resources: Resource[] }>(
        `/resources?userId=${userId}`,
        { token }
      );
      setResources(data.resources ?? []);
    } catch (e: any) {
      setError(e.message ?? "Failed to load resources");
    }
  }

  async function fetchSuggestions(force: boolean) {
    if (!resources) return;

    if (!force && canUseCache) return;

    setLoading(true);
    setError(null);

    try {
      const resp = await apiFetch<SuggestionsResp>("/ai/suggest-next", {
        method: "POST",
        token,
        body: JSON.stringify({
          userId,
          resources,
          history: [], // later: load PROGRESS logs
        }),
      });

      setSuggestions(resp.suggestions ?? []);
      setLastFetchedAt(Date.now());
    } catch (e: any) {
      setError(e.message ?? "Suggestion request failed");
    } finally {
      setLoading(false);
    }
  }

  const renderSkeleton = () => (
    <View style={styles.skeletonCard}>
      <View style={styles.skeletonLineLg} />
      <View style={styles.skeletonLineSm} />
      <View style={styles.skeletonLineSm} />
    </View>
  );

  return (
    <View style={styles.container}>
      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <View style={styles.headerRow}>
        <Text style={styles.subtitle}>
          Based on your resources and progress
        </Text>
        <Button title="Refresh" onPress={() => fetchSuggestions(true)} />
      </View>

      {loading && (
        <>
          {renderSkeleton()}
          {renderSkeleton()}
          {renderSkeleton()}
        </>
      )}

      {!loading && suggestions && suggestions.length === 0 && (
        <Text>No suggestions yet. Add more resources first.</Text>
      )}

      {!loading && suggestions && suggestions.length > 0 && (
        <FlatList
          data={suggestions}
          keyExtractor={(s, i) => `${s.title}-${i}`}
          renderItem={({ item, index }) => (
            <View style={styles.card}>
              <Text style={styles.title}>
                {index + 1}. {item.title}
              </Text>
              <Text style={styles.meta}>{item.type}</Text>

              <Text style={styles.reasonTitle}>Why this?</Text>
              <Text style={styles.reason}>{item.reason}</Text>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 12, gap: 12 },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  subtitle: { fontSize: 14, opacity: 0.7 },
  card: {
    padding: 12,
    borderWidth: 1,
    borderRadius: 10,
    marginBottom: 10,
    gap: 6,
  },
  title: { fontSize: 18, fontWeight: "600" },
  meta: { fontSize: 12, opacity: 0.7 },
  reasonTitle: { fontSize: 13, fontWeight: "600", marginTop: 4 },
  reason: { fontSize: 14, lineHeight: 18 },

  errorBox: {
    padding: 10,
    borderWidth: 1,
    borderRadius: 8,
  },
  errorText: { fontSize: 14 },

  skeletonCard: {
    padding: 12,
    borderWidth: 1,
    borderRadius: 10,
    gap: 8,
    opacity: 0.5,
  },
  skeletonLineLg: { height: 18, borderWidth: 1, borderRadius: 6 },
  skeletonLineSm: { height: 12, borderWidth: 1, borderRadius: 6 },
});
