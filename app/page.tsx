"use client";

import { FormEvent, useEffect, useMemo, useState, useCallback } from "react";
import {
  CheckCheck, Copy, LoaderCircle, Plus, RefreshCw, Save, Sparkles, WandSparkles, Clock, Trash2,
  TrendingUp, BarChart3, Lightbulb, Repeat2, MessageSquare, Hash, Edit3, FileText, Zap, Rss,
} from "lucide-react";
import { Toaster, toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { USER_STYLE_SAMPLE, type StyleTweet } from "@/lib/style-engine";
import { cn } from "@/lib/utils";

type TweetDraft = {
  id: string;
  text: string;
  rationale: string;
  charCount: number;
};

type Feed = {
  id: string;
  name: string;
  url: string;
  category: string;
};

type FeedEntry = {
  id?: string;
  title: string;
  link: string;
  decodedUrl?: string;
  canonicalUrl?: string;
  officialTweetUrl?: string | null;
  publishedAt: string;
  summary: string;
  relevanceScore?: number;
  nicheTopics?: string[];
};

type TweetHistoryItem = {
  id: string;
  runId: string;
  text: string;
  rationale: string;
  charCount: number;
  sourceType: "manual" | "rss";
  sourcePrompt: string;
  feedName?: string;
  createdAt: string;
};

type AnalyticsData = {
  totalTweets: number;
  totalRuns: number;
  manualTweets: number;
  rssTweets: number;
  topFeeds: { name: string; count: number }[];
  recentActivity: { date: string; count: number }[];
  trendingTopics: string[];
};

type TopicSuggestion = {
  topic: string;
  angle: string;
  sourceTitle?: string;
  urgency: "high" | "medium" | "low";
};

type RefineState = {
  tweetId: string;
  instruction: string;
  isLoading: boolean;
  refinedText?: string;
};

const STARTER_PROMPTS = [
  "A quick opinion on why consistency beats motivation",
  "A short tweet about learning from failed experiments",
  "A personal note on shipping before perfecting",
  "A clean tweet about building with AI tools daily",
];

export default function Page() {
  const [prompt, setPrompt] = useState("");
  const [styleTweets, setStyleTweets] = useState<StyleTweet[]>(USER_STYLE_SAMPLE);
  const [feeds, setFeeds] = useState<Feed[]>([]);
  const [selectedFeedId, setSelectedFeedId] = useState<string>("");
  const [tweets, setTweets] = useState<TweetDraft[]>([]);
  const [sourceEntries, setSourceEntries] = useState<FeedEntry[]>([]);
  const [isLoadingManual, setIsLoadingManual] = useState(false);
  const [isLoadingFeed, setIsLoadingFeed] = useState(false);
  const [isSavingStyle, setIsSavingStyle] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const [historyTweets, setHistoryTweets] = useState<TweetHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyHasMore, setHistoryHasMore] = useState(false);
  const [historyOffset, setHistoryOffset] = useState(0);
  const [activeTab, setActiveTab] = useState("generate");

  // Feed management state
  const [newFeedName, setNewFeedName] = useState("");
  const [newFeedUrl, setNewFeedUrl] = useState("");
  const [newFeedCategory, setNewFeedCategory] = useState("Tech");
  const [isAddingFeed, setIsAddingFeed] = useState(false);
  const [isDeletingFeed, setIsDeletingFeed] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);

  // Analytics state
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);

  // Topic suggestions state
  const [topicSuggestions, setTopicSuggestions] = useState<TopicSuggestion[]>([]);
  const [topicsLoading, setTopicsLoading] = useState(false);

  // Thread generation state
  const [threadTopic, setThreadTopic] = useState("");
  const [threadLength, setThreadLength] = useState(3);
  const [isLoadingThread, setIsLoadingThread] = useState(false);
  const [threadTweets, setThreadTweets] = useState<TweetDraft[]>([]);

  // Refinement state
  const [refineStates, setRefineStates] = useState<Record<string, RefineState>>({});

  const canGenerateManual = prompt.trim().length >= 5 && !isLoadingManual;
  const canGenerateFeed = selectedFeedId.length > 0 && !isLoadingFeed;
  const canAddFeed = newFeedName.trim().length >= 2 && newFeedUrl.trim().length > 0 && !isAddingFeed;

  const styleTweetCount = useMemo(
    () => styleTweets.filter((tweet) => tweet.tweet.trim().length > 0).length,
    [styleTweets],
  );

  // Analytics fetch
  const fetchAnalytics = useCallback(async () => {
    setAnalyticsLoading(true);
    try {
      const res = await fetch("/api/analytics");
      if (res.ok) {
        const data = await res.json();
        setAnalytics(data);
      }
    } catch (error) {
      console.error("Analytics fetch failed:", error);
    } finally {
      setAnalyticsLoading(false);
    }
  }, []);

  // Topic suggestions fetch
  const fetchTopicSuggestions = useCallback(async () => {
    setTopicsLoading(true);
    try {
      const res = await fetch("/api/topic-suggestions");
      if (res.ok) {
        const data = await res.json();
        setTopicSuggestions(data.suggestions ?? []);
      }
    } catch (error) {
      console.error("Topic suggestions failed:", error);
    } finally {
      setTopicsLoading(false);
    }
  }, []);

  useEffect(() => {
    const bootstrap = async () => {
      try {
        const [styleRes, feedRes] = await Promise.all([
          fetch("/api/style"),
          fetch("/api/feeds"),
        ]);

        if (styleRes.ok) {
          const stylePayload = await styleRes.json();
          if (Array.isArray(stylePayload?.tweets) && stylePayload.tweets.length > 0) {
            setStyleTweets(stylePayload.tweets);
          }
        }

        if (feedRes.ok) {
          const feedPayload = await feedRes.json();
          const nextFeeds = (feedPayload?.feeds as Feed[] | undefined) ?? [];
          setFeeds(nextFeeds);
          if (nextFeeds[0]?.id) {
            setSelectedFeedId(nextFeeds[0].id);
          }
        }

        // Fetch analytics in background
        fetchAnalytics();
      } catch (error) {
        console.error(error);
        toast.error("Failed to load initial data.");
      }
    };

    void bootstrap();
  }, [fetchAnalytics]);

  const fetchHistory = async (append = false) => {
    if (historyLoading) return;
    
    setHistoryLoading(true);
    const offset = append ? historyOffset : 0;
    
    try {
      const res = await fetch(`/api/history?limit=10&offset=${offset}`);
      const payload = await res.json().catch(() => null);
      
      if (res.ok && Array.isArray(payload?.tweets)) {
        if (append) {
          setHistoryTweets(prev => [...prev, ...payload.tweets]);
        } else {
          setHistoryTweets(payload.tweets);
        }
        setHistoryHasMore(payload.pagination?.hasMore ?? false);
        setHistoryOffset(offset + 10);
      }
    } catch (error) {
      console.error("Failed to load history:", error);
    } finally {
      setHistoryLoading(false);
    }
  };

  const loadMoreHistory = () => {
    fetchHistory(true);
  };

  useEffect(() => {
    if (activeTab === "feed") {
      fetchHistory();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const saveStyle = async () => {
    const validTweets = styleTweets
      .map((tweet, index) => ({ id: index + 1, tweet: tweet.tweet.trim() }))
      .filter((tweet) => tweet.tweet.length > 0);

    if (validTweets.length < 3) {
      toast.error("Add at least 3 style tweets before saving.");
      return;
    }

    setIsSavingStyle(true);

    try {
      const response = await fetch("/api/style", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tweets: validTweets }),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error ?? "Failed to save style.");
      }

      if (Array.isArray(payload?.tweets)) {
        setStyleTweets(payload.tweets);
      }
      toast.success("Style profile saved.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Style save failed.";
      toast.error(message);
    } finally {
      setIsSavingStyle(false);
    }
  };

  const generateManualTweets = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canGenerateManual) {
      return;
    }

    setIsLoadingManual(true);
    setTweets([]);
    setSourceEntries([]);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error ?? "Generation failed.");
      }

      const nextTweets = (payload?.tweets as TweetDraft[] | undefined) ?? [];
      if (nextTweets.length !== 3) {
        throw new Error("The model did not return 3 tweets. Please retry.");
      }

      setTweets(nextTweets);
      toast.success("Generated 3 tweet drafts.");
      if (activeTab === "feed") {
        setHistoryTweets([]);
        setHistoryOffset(0);
        fetchHistory();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Request failed.";
      toast.error(message);
    } finally {
      setIsLoadingManual(false);
    }
  };

  const generateFromFeed = async () => {
    if (!canGenerateFeed) {
      return;
    }

    setIsLoadingFeed(true);
    setTweets([]);
    setSourceEntries([]);

    try {
      const response = await fetch("/api/generate-from-feed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedId: selectedFeedId }),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error ?? "Feed generation failed.");
      }

      const nextTweets = (payload?.tweets as TweetDraft[] | undefined) ?? [];
      if (nextTweets.length !== 3) {
        throw new Error("The model did not return 3 tweets. Please retry.");
      }

      setTweets(nextTweets);
      setSourceEntries((payload?.sourceEntries as FeedEntry[] | undefined) ?? []);
      toast.success("Generated 3 tweets from RSS feed.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Feed request failed.";
      toast.error(message);
    } finally {
      setIsLoadingFeed(false);
    }
  };

  const copyTweet = async (tweet: TweetDraft | TweetHistoryItem) => {
    await navigator.clipboard.writeText(tweet.text);
    setCopiedId(tweet.id);
    toast.success("Tweet copied.");
    window.setTimeout(() => setCopiedId(null), 1500);
  };

  const addStyleTweet = () => {
    setStyleTweets((prev) => [...prev, { id: prev.length + 1, tweet: "" }]);
  };

  const updateStyleTweet = (id: number, tweet: string) => {
    setStyleTweets((prev) => prev.map((item) => (item.id === id ? { ...item, tweet } : item)));
  };

  const removeStyleTweet = (id: number) => {
    setStyleTweets((prev) =>
      prev
        .filter((item) => item.id !== id)
        .map((item, index) => ({ ...item, id: index + 1 })),
    );
  };

  const addFeed = async () => {
    if (!canAddFeed) return;

    setIsAddingFeed(true);
    try {
      const response = await fetch("/api/feeds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newFeedName.trim(),
          url: newFeedUrl.trim(),
          category: newFeedCategory.trim() || "Tech",
        }),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error ?? "Failed to add feed.");
      }

      const newFeed = payload?.feed as Feed | undefined;
      if (newFeed) {
        setFeeds((prev) => [...prev, newFeed]);
        setSelectedFeedId(newFeed.id);
      }

      setNewFeedName("");
      setNewFeedUrl("");
      setNewFeedCategory("Tech");
      setShowAddForm(false);
      toast.success("RSS feed added successfully.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to add feed.";
      toast.error(message);
    } finally {
      setIsAddingFeed(false);
    }
  };

  const deleteFeed = async (feedId: string) => {
    if (feeds.length <= 1) {
      toast.error("Cannot delete the last feed.");
      return;
    }

    setIsDeletingFeed(feedId);
    try {
      const response = await fetch(`/api/feeds?id=${feedId}`, {
        method: "DELETE",
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error ?? "Failed to delete feed.");
      }

      setFeeds((prev) => prev.filter((f) => f.id !== feedId));
      if (selectedFeedId === feedId) {
        const remaining = feeds.filter((f) => f.id !== feedId);
        setSelectedFeedId(remaining[0]?.id ?? "");
      }
      toast.success("Feed removed.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to delete feed.";
      toast.error(message);
    } finally {
      setIsDeletingFeed(null);
    }
  };

  // Thread generation
  const generateThread = async () => {
    if (threadTopic.trim().length < 5) {
      toast.error("Enter a topic for the thread.");
      return;
    }

    setIsLoadingThread(true);
    setThreadTweets([]);
    try {
      const response = await fetch("/api/thread", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: threadTopic, threadLength }),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error ?? "Thread generation failed.");
      }

      setThreadTweets(payload.tweets ?? []);
      toast.success(`Generated ${payload.threadLength ?? threadLength}-tweet thread.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Thread request failed.";
      toast.error(message);
    } finally {
      setIsLoadingThread(false);
    }
  };

  // Tweet refinement
  const refineTweet = async (tweetId: string, originalText: string, instruction: string) => {
    if (!instruction.trim()) {
      toast.error("Enter a refinement instruction.");
      return;
    }

    setRefineStates((prev) => ({
      ...prev,
      [tweetId]: { tweetId, instruction, isLoading: true },
    }));

    try {
      const response = await fetch("/api/refine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          originalTweet: originalText,
          refinementInstruction: instruction,
        }),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error ?? "Refinement failed.");
      }

      setRefineStates((prev) => ({
        ...prev,
        [tweetId]: { ...prev[tweetId], isLoading: false, refinedText: payload.refinedTweet },
      }));

      // Update the tweet text in the tweets array
      setTweets((prev) =>
        prev.map((t) => (t.id === tweetId ? { ...t, text: payload.refinedTweet, charCount: payload.refinedTweet.length } : t)),
      );

      toast.success("Tweet refined!");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Refinement failed.";
      toast.error(message);
      setRefineStates((prev) => ({
        ...prev,
        [tweetId]: { ...prev[tweetId], isLoading: false },
      }));
    }
  };

  // Quick refinement presets
  const quickRefinements = ["Make it funnier", "More technical", "Shorter", "Add a hook", "More personal", "Less formal"];

  // Use a starter topic for thread
  const THREAD_STARTERS = [
    "Why consistency beats motivation for solo builders",
    "The real cost of shipping imperfect code",
    "What I learned building with AI tools for 6 months",
  ];

  return (
    <main className="flex-1 bg-gradient-magic">
      <Toaster position="top-center" richColors closeButton />

      <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        {/* Hero Section */}
        <section className="mb-6 sm:mb-8">
          <Badge className="mb-3 gap-1 rounded-full bg-primary/12 text-primary ring-1 ring-primary/20">
            <Sparkles className="size-3.5" />
            Dynamic Style + RSS Engine
          </Badge>
          <h1 className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl lg:text-4xl">
            Tech News to Viral Hook Tweets
          </h1>
          <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground sm:mt-2">
            Generate in two ways: custom prompt or selected RSS feed. Both use your saved writing style.
          </p>
        </section>

        <Separator className="mb-6 sm:mb-8" />

        {/* Main Workspace Card with Tabs */}
        <Card className="rounded-2xl border border-border/60 bg-card/85 backdrop-blur-sm">
          <CardHeader>
            <CardTitle>Generation Workspace</CardTitle>
            <CardDescription>Write a prompt, pick an RSS feed, or manage your writing style.</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="w-full rounded-xl bg-muted/50">
                <TabsTrigger value="generate">Manual Prompt</TabsTrigger>
                <TabsTrigger value="rss">RSS Feed</TabsTrigger>
                <TabsTrigger value="thread">Thread</TabsTrigger>
                <TabsTrigger value="topics">Topics</TabsTrigger>
                <TabsTrigger value="analytics">Analytics</TabsTrigger>
                <TabsTrigger value="style">Saved Style</TabsTrigger>
                <TabsTrigger value="feed">Feed</TabsTrigger>
              </TabsList>

              {/* Manual Prompt Tab */}
              <TabsContent value="generate" className="mt-4">
                <form onSubmit={generateManualTweets} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="tweet-request">What should the tweets be about?</Label>
                    <Textarea
                      id="tweet-request"
                      value={prompt}
                      onChange={(event) => setPrompt(event.target.value)}
                      placeholder="Example: Tweet about why async processing improved our API reliability in plain language."
                      className="min-h-28 rounded-xl border-border/70 bg-background/70 text-sm"
                    />
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {STARTER_PROMPTS.map((starter) => (
                      <button
                        key={starter}
                        type="button"
                        onClick={() => setPrompt(starter)}
                        className="rounded-full border border-border/60 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground active:scale-[0.97]"
                      >
                        {starter}
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs text-muted-foreground">{prompt.trim().length} chars</p>
                    <Button type="submit" disabled={!canGenerateManual} className="h-10 rounded-xl px-5 sm:h-9">
                      {isLoadingManual ? (
                        <>
                          <LoaderCircle className="size-4 animate-spin" />
                          Generating
                        </>
                      ) : (
                        <>
                          <WandSparkles className="size-4" />
                          Generate 3 Tweets
                        </>
                      )}
                    </Button>
                  </div>
                </form>
              </TabsContent>

              {/* RSS Feed Tab */}
              <TabsContent value="rss" className="mt-4 space-y-4">
                <div className="space-y-4">
                  {/* Feed Selector */}
                  <div className="space-y-2">
                    <Label>Select RSS Feed</Label>
                    <Select value={selectedFeedId} onValueChange={setSelectedFeedId}>
                      <SelectTrigger className="h-11 w-full rounded-xl border-border/70 bg-background/70 sm:h-10">
                        <SelectValue placeholder="Choose a feed" />
                      </SelectTrigger>
                      <SelectContent>
                        {feeds.map((feed) => (
                          <SelectItem key={feed.id} value={feed.id}>
                            {feed.name} ({feed.category})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Generate Button */}
                  <Button
                    type="button"
                    disabled={!canGenerateFeed}
                    onClick={generateFromFeed}
                    className="h-10 w-full rounded-xl sm:h-9"
                  >
                    {isLoadingFeed ? (
                      <>
                        <LoaderCircle className="size-4 animate-spin" />
                        Fetching + Generating
                      </>
                    ) : (
                      <>
                        <RefreshCw className="size-4" />
                        Generate From Feed
                      </>
                    )}
                  </Button>

                  {/* Feed Management Section */}
                  <div className="pt-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-medium">Manage Feeds</Label>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setShowAddForm(!showAddForm)}
                        className="rounded-lg"
                      >
                        <Plus className="mr-1 size-3" />
                        {showAddForm ? "Cancel" : "Add Feed"}
                      </Button>
                    </div>

                    {/* Add Feed Form */}
                    {showAddForm && (
                      <div className="mt-3 space-y-3 rounded-xl border border-border/60 bg-muted/30 p-4">
                        <div className="space-y-2">
                          <Label htmlFor="feed-name" className="text-xs">Feed Name</Label>
                          <input
                            id="feed-name"
                            type="text"
                            value={newFeedName}
                            onChange={(e) => setNewFeedName(e.target.value)}
                            placeholder="e.g., TechCrunch AI"
                            className="w-full rounded-lg border border-border/70 bg-background/70 px-3 py-2 text-sm outline-none focus:border-primary"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="feed-url" className="text-xs">RSS Feed URL</Label>
                          <input
                            id="feed-url"
                            type="url"
                            value={newFeedUrl}
                            onChange={(e) => setNewFeedUrl(e.target.value)}
                            placeholder="https://example.com/feed.xml"
                            className="w-full rounded-lg border border-border/70 bg-background/70 px-3 py-2 text-sm outline-none focus:border-primary"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="feed-category" className="text-xs">Category</Label>
                          <Select value={newFeedCategory} onValueChange={setNewFeedCategory}>
                            <SelectTrigger className="h-10 w-full rounded-lg border-border/70 bg-background/70">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Tech">Tech</SelectItem>
                              <SelectItem value="AI">AI</SelectItem>
                              <SelectItem value="Web Dev">Web Dev</SelectItem>
                              <SelectItem value="Design">Design</SelectItem>
                              <SelectItem value="Business">Business</SelectItem>
                              <SelectItem value="Other">Other</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <Button
                          type="button"
                          onClick={addFeed}
                          disabled={!canAddFeed}
                          className="w-full rounded-lg"
                        >
                          {isAddingFeed ? (
                            <>
                              <LoaderCircle className="mr-2 size-4 animate-spin" />
                              Adding...
                            </>
                          ) : (
                            <>
                              <Plus className="mr-2 size-4" />
                              Add Feed
                            </>
                          )}
                        </Button>
                      </div>
                    )}

                    {/* Feed List */}
                    <div className="mt-3 space-y-2">
                      {feeds.map((feed) => (
                        <div
                          key={feed.id}
                          className="flex items-center justify-between rounded-lg border border-border/60 bg-background/50 px-3 py-2.5"
                        >
                          <div className="flex-1">
                            <p className="text-sm font-medium">{feed.name}</p>
                            <p className="truncate text-xs text-muted-foreground">{feed.url}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary" className="rounded-full text-xs">
                              {feed.category}
                            </Badge>
                            <button
                              type="button"
                              onClick={() => deleteFeed(feed.id)}
                              disabled={isDeletingFeed === feed.id || feeds.length <= 1}
                              className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-40"
                              title="Remove feed"
                            >
                              {isDeletingFeed === feed.id ? (
                                <LoaderCircle className="size-4 animate-spin" />
                              ) : (
                                <Trash2 className="size-4" />
                              )}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </TabsContent>

              {/* Thread Generation Tab */}
              <TabsContent value="thread" className="mt-4 space-y-4">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="thread-topic">Thread Topic</Label>
                    <Textarea
                      id="thread-topic"
                      value={threadTopic}
                      onChange={(event) => setThreadTopic(event.target.value)}
                      placeholder="What should the thread be about?"
                      className="min-h-24 rounded-xl border-border/70 bg-background/70 text-sm"
                    />
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {THREAD_STARTERS.map((starter) => (
                      <button
                        key={starter}
                        type="button"
                        onClick={() => setThreadTopic(starter)}
                        className="rounded-full border border-border/60 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground active:scale-[0.97]"
                      >
                        {starter}
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center gap-3">
                    <Label className="text-sm">Thread Length:</Label>
                    <Select value={String(threadLength)} onValueChange={(v) => setThreadLength(Number(v))}>
                      <SelectTrigger className="h-9 w-20 rounded-lg border-border/70 bg-background/70">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {[2, 3, 4, 5].map((n) => (
                          <SelectItem key={n} value={String(n)}>{n} tweets</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <Button
                    type="button"
                    disabled={threadTopic.trim().length < 5 || isLoadingThread}
                    onClick={generateThread}
                    className="h-10 w-full rounded-xl sm:h-9"
                  >
                    {isLoadingThread ? (
                      <>
                        <LoaderCircle className="size-4 animate-spin" />
                        Generating Thread
                      </>
                    ) : (
                      <>
                        <Repeat2 className="size-4" />
                        Generate {threadLength}-Tweet Thread
                      </>
                    )}
                  </Button>
                </div>
              </TabsContent>

              {/* AI Topic Suggestions Tab */}
              <TabsContent value="topics" className="mt-4 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-medium">AI-Powered Suggestions</h3>
                    <p className="text-xs text-muted-foreground">Topics based on your RSS feeds + writing style</p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={fetchTopicSuggestions}
                    disabled={topicsLoading}
                    className="rounded-lg"
                  >
                    {topicsLoading ? (
                      <LoaderCircle className="size-4 animate-spin" />
                    ) : (
                      <Lightbulb className="size-4" />
                    )}
                    {topicsLoading ? "Analyzing..." : "Get Suggestions"}
                  </Button>
                </div>

                {topicsLoading && topicSuggestions.length === 0 ? (
                  <div className="space-y-3">
                    {[0, 1, 2, 3, 4].map((i) => (
                      <Skeleton key={i} className="h-24 w-full rounded-xl" />
                    ))}
                  </div>
                ) : topicSuggestions.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-border/70 bg-background/60 px-4 py-10 text-center">
                    <Lightbulb className="mx-auto mb-3 size-8 text-muted-foreground/50" />
                    <p className="text-sm text-muted-foreground">
                      Click &quot;Get Suggestions&quot; for AI-powered tweet topics.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {topicSuggestions.map((suggestion, index) => (
                      <Card key={index} className="rounded-xl border border-border/60 bg-card/90 transition-transform hover:-translate-y-0.5">
                        <CardContent className="pt-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <h4 className="text-sm font-medium">{suggestion.topic}</h4>
                                <Badge
                                  variant={
                                    suggestion.urgency === "high" ? "destructive" :
                                    suggestion.urgency === "medium" ? "secondary" : "outline"
                                  }
                                  className="rounded-full text-[10px]"
                                >
                                  {suggestion.urgency}
                                </Badge>
                              </div>
                              <p className="mt-1 text-xs text-muted-foreground">{suggestion.angle}</p>
                              {suggestion.sourceTitle && (
                                <p className="mt-1 text-[11px] text-muted-foreground/70 flex items-center gap-1">
                                  <Rss className="size-3" />
                                  {suggestion.sourceTitle}
                                </p>
                              )}
                            </div>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="shrink-0 h-8 rounded-lg"
                              onClick={() => {
                                setPrompt(suggestion.topic);
                                setActiveTab("generate");
                                toast.success("Topic loaded into generator!");
                              }}
                            >
                              <WandSparkles className="size-3.5" />
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </TabsContent>

              {/* Analytics Dashboard Tab */}
              <TabsContent value="analytics" className="mt-4 space-y-4">
                {analyticsLoading && !analytics ? (
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    {[0, 1, 2, 3].map((i) => (
                      <Skeleton key={i} className="h-28 w-full rounded-xl" />
                    ))}
                  </div>
                ) : analytics ? (
                  <>
                    {/* Stats Cards */}
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                      <Card className="rounded-xl border border-border/60 bg-card/90">
                        <CardContent className="pt-4">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-xs text-muted-foreground">Total Tweets</p>
                              <p className="text-2xl font-semibold">{analytics.totalTweets}</p>
                            </div>
                            <div className="rounded-lg bg-primary/10 p-2">
                              <FileText className="size-5 text-primary" />
                            </div>
                          </div>
                        </CardContent>
                      </Card>

                      <Card className="rounded-xl border border-border/60 bg-card/90">
                        <CardContent className="pt-4">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-xs text-muted-foreground">Generation Runs</p>
                              <p className="text-2xl font-semibold">{analytics.totalRuns}</p>
                            </div>
                            <div className="rounded-lg bg-blue-500/10 p-2">
                              <Zap className="size-5 text-blue-500" />
                            </div>
                          </div>
                        </CardContent>
                      </Card>

                      <Card className="rounded-xl border border-border/60 bg-card/90">
                        <CardContent className="pt-4">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-xs text-muted-foreground">Manual Tweets</p>
                              <p className="text-2xl font-semibold">{analytics.manualTweets}</p>
                            </div>
                            <div className="rounded-lg bg-emerald-500/10 p-2">
                              <MessageSquare className="size-5 text-emerald-500" />
                            </div>
                          </div>
                        </CardContent>
                      </Card>

                      <Card className="rounded-xl border border-border/60 bg-card/90">
                        <CardContent className="pt-4">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-xs text-muted-foreground">RSS Tweets</p>
                              <p className="text-2xl font-semibold">{analytics.rssTweets}</p>
                            </div>
                            <div className="rounded-lg bg-amber-500/10 p-2">
                              <Rss className="size-5 text-amber-500" />
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </div>

                    {/* Trending Topics */}
                    {analytics.trendingTopics.length > 0 && (
                      <Card className="rounded-xl border border-border/60 bg-card/90">
                        <CardHeader className="pb-2">
                          <CardTitle className="flex items-center gap-2 text-sm">
                            <TrendingUp className="size-4" />
                            Trending Topics (Last 7 Days)
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="flex flex-wrap gap-2">
                            {analytics.trendingTopics.map((topic, i) => (
                              <Badge key={i} variant="outline" className="rounded-full text-xs cursor-pointer hover:bg-muted"
                                onClick={() => {
                                  setPrompt(topic);
                                  setActiveTab("generate");
                                }}>
                                <Hash className="size-3" />
                                {topic}
                              </Badge>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    )}

                    {/* Top Feeds */}
                    {analytics.topFeeds.length > 0 && (
                      <Card className="rounded-xl border border-border/60 bg-card/90">
                        <CardHeader className="pb-2">
                          <CardTitle className="flex items-center gap-2 text-sm">
                            <BarChart3 className="size-4" />
                            Top RSS Feeds
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-2">
                            {analytics.topFeeds.map((feed, i) => (
                              <div key={i} className="flex items-center justify-between">
                                <span className="text-sm">{feed.name}</span>
                                <div className="flex items-center gap-2">
                                  <div className="h-2 w-24 rounded-full bg-muted overflow-hidden">
                                    <div
                                      className="h-full rounded-full bg-primary"
                                      style={{
                                        width: `${analytics.topFeeds.length > 0 ? (feed.count / Math.max(...analytics.topFeeds.map(f => f.count))) * 100 : 0}%`
                                      }}
                                    />
                                  </div>
                                  <span className="text-xs text-muted-foreground w-8 text-right">{feed.count}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    )}
                  </>
                ) : (
                  <div className="rounded-2xl border border-dashed border-border/70 bg-background/60 px-4 py-10 text-center">
                    <BarChart3 className="mx-auto mb-3 size-8 text-muted-foreground/50" />
                    <p className="text-sm text-muted-foreground">
                      No analytics data yet. Generate some tweets to see stats.
                    </p>
                  </div>
                )}
              </TabsContent>

              {/* Saved Writing Style Tab */}
              <TabsContent value="style" className="mt-4">
                <div className="space-y-3">
                  <div className="max-h-[340px] space-y-3 overflow-y-auto pr-1 sm:max-h-[380px]">
                    {styleTweets.map((item, index) => (
                      <div key={item.id} className="space-y-1">
                        <div className="flex items-center justify-between">
                          <Label className="text-xs">Style Tweet {index + 1}</Label>
                          <button
                            type="button"
                            onClick={() => removeStyleTweet(item.id)}
                            className="rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                            disabled={styleTweets.length <= 3}
                          >
                            Remove
                          </button>
                        </div>
                        <Textarea
                          value={item.tweet}
                          onChange={(event) => updateStyleTweet(item.id, event.target.value)}
                          className="min-h-20 rounded-xl border-border/70 bg-background/70 text-sm"
                        />
                      </div>
                    ))}
                  </div>
                </div>
                <div className="mt-4 flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">{styleTweetCount} valid samples</p>
                    <Button type="button" variant="outline" size="sm" onClick={addStyleTweet} className="rounded-lg">
                      <Plus className="size-4" />
                      Add
                    </Button>
                  </div>
                  <Button type="button" onClick={saveStyle} disabled={isSavingStyle} className="h-10 w-full rounded-xl sm:h-9">
                    {isSavingStyle ? (
                      <>
                        <LoaderCircle className="size-4 animate-spin" />
                        Saving
                      </>
                    ) : (
                      <>
                        <Save className="size-4" />
                        Save Style
                      </>
                    )}
                  </Button>
                </div>
              </TabsContent>

              {/* Feed Tab - Recent Generated Tweets */}
              <TabsContent value="feed" className="mt-4">
                {historyLoading && historyTweets.length === 0 ? (
                  <div className="space-y-4">
                    {[0, 1, 2].map((index) => (
                      <div key={index} className="h-40 animate-pulse rounded-2xl border border-border/60 bg-card/60" />
                    ))}
                  </div>
                ) : historyTweets.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-border/70 bg-background/60 px-4 py-10 text-center sm:px-6 sm:py-12">
                    <Clock className="mx-auto mb-3 size-8 text-muted-foreground/50" />
                    <p className="text-sm text-muted-foreground">
                      No tweets generated yet. Create some tweets to see them here.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {historyTweets.map((tweet) => (
                      <Card
                        key={tweet.id}
                        className="rounded-2xl border border-border/60 bg-card/90 transition-transform hover:-translate-y-0.5"
                      >
                        <CardHeader className="pb-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="rounded-full">
                                {tweet.sourceType === "rss" ? "RSS" : "Manual"}
                              </Badge>
                              {tweet.feedName && (
                                <Badge variant="secondary" className="rounded-full">
                                  {tweet.feedName}
                                </Badge>
                              )}
                              <span className="text-xs text-muted-foreground">
                                <Clock className="mr-1 inline size-3" />
                                {new Date(tweet.createdAt).toLocaleDateString()}
                              </span>
                            </div>
                            <Badge variant="outline" className="rounded-full">
                              {tweet.charCount}/280
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">{tweet.rationale}</p>
                        </CardHeader>
                        <CardContent>
                          <p className="whitespace-pre-wrap text-sm leading-relaxed">{tweet.text}</p>
                        </CardContent>
                        <CardFooter className="justify-end gap-2 border-t border-border/60">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => copyTweet(tweet)}
                            className="h-9 rounded-lg px-4"
                          >
                            {copiedId === tweet.id ? (
                              <>
                                <CheckCheck className="size-4 text-emerald-600" />
                                Copied
                              </>
                            ) : (
                              <>
                                <Copy className="size-4" />
                                Copy
                              </>
                            )}
                          </Button>
                        </CardFooter>
                      </Card>
                    ))}
                    {historyHasMore && (
                      <div className="flex justify-center pt-2">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={loadMoreHistory}
                          disabled={historyLoading}
                          className="rounded-xl"
                        >
                          {historyLoading ? (
                            <>
                              <LoaderCircle className="size-4 animate-spin" />
                              Loading...
                            </>
                          ) : (
                            "Load More"
                          )}
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        {/* Generated Tweets */}
        <section className="mt-8 sm:mt-10">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-heading text-lg font-semibold sm:text-xl">Generated Tweets</h2>
            {tweets.length > 0 && (
              <Button variant="outline" onClick={() => setTweets([])} className="rounded-lg text-xs">
                Clear
              </Button>
            )}
          </div>

          {(isLoadingManual || isLoadingFeed || isLoadingThread) && (
            <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
              {[0, 1, 2].map((index) => (
                <div key={index} className="h-56 animate-pulse rounded-2xl border border-border/60 bg-card/60" />
              ))}
            </div>
          )}

          {!isLoadingManual && !isLoadingFeed && !isLoadingThread && tweets.length === 0 && threadTweets.length === 0 && (
            <div className="rounded-2xl border border-dashed border-border/70 bg-background/60 px-4 py-10 text-center sm:px-6 sm:py-12">
              <p className="text-sm text-muted-foreground">
                Generate from prompt or RSS feed to see three tweet drafts.
              </p>
            </div>
          )}

          {!isLoadingManual && !isLoadingFeed && tweets.length > 0 && (
            <div className="space-y-4 sm:space-y-5">
              {sourceEntries.length > 0 && (
                <Card className="rounded-2xl border border-border/60 bg-card/90">
                  <CardHeader>
                    <CardTitle>RSS Context Used</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {sourceEntries.map((entry) => (
                      <a
                        key={entry.id ?? entry.link}
                        href={entry.link}
                        target="_blank"
                        rel="noreferrer"
                        className="block rounded-lg border border-border/60 px-3 py-2.5 text-xs transition-colors hover:bg-muted/40 active:bg-muted/60"
                      >
                        <p className="font-medium text-foreground">{entry.title}</p>
                        <p className="text-muted-foreground">{entry.publishedAt || "Unknown date"}</p>
                        {entry.nicheTopics && entry.nicheTopics.length > 0 && (
                          <p className="mt-1 text-[11px] text-muted-foreground">
                            Topics: {entry.nicheTopics.join(", ")}
                          </p>
                        )}
                        {entry.canonicalUrl && (
                          <p className="mt-1 truncate text-[11px] text-muted-foreground">
                            Canonical: {entry.canonicalUrl}
                          </p>
                        )}
                        {entry.officialTweetUrl && (
                          <p className="mt-1 truncate text-[11px] text-muted-foreground">
                            Official tweet: {entry.officialTweetUrl}
                          </p>
                        )}
                      </a>
                    ))}
                  </CardContent>
                </Card>
              )}

              <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
                {tweets.map((tweet, index) => (
                  <Card
                    key={tweet.id}
                    className={cn(
                      "rounded-2xl border border-border/60 bg-card/90 transition-transform",
                      "hover:-translate-y-0.5 active:translate-y-0",
                    )}
                  >
                    <CardHeader className="pb-2">
                      <CardTitle className="flex items-center justify-between">
                        <span>Draft {index + 1}</span>
                        <Badge variant="outline" className="rounded-full">
                          {tweet.charCount}/280
                        </Badge>
                      </CardTitle>
                      <p className="text-xs text-muted-foreground">{tweet.rationale}</p>
                    </CardHeader>
                    <CardContent>
                      <p className="whitespace-pre-wrap text-sm leading-relaxed">{tweet.text}</p>
                    </CardContent>
                    <CardFooter className="flex-col gap-2 border-t border-border/60">
                      <div className="flex w-full gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => copyTweet(tweet)}
                          className="h-9 flex-1 rounded-lg px-4"
                        >
                          {copiedId === tweet.id ? (
                            <>
                              <CheckCheck className="size-4 text-emerald-600" />
                              Copied
                            </>
                          ) : (
                            <>
                              <Copy className="size-4" />
                              Copy
                            </>
                          )}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            const refineState = refineStates[tweet.id];
                            if (refineState?.refinedText) {
                              setRefineStates((prev) => ({
                                ...prev,
                                [tweet.id]: { ...prev[tweet.id], refinedText: undefined },
                              }));
                            } else {
                              setRefineStates((prev) => ({
                                ...prev,
                                [tweet.id]: { tweetId: tweet.id, instruction: "", isLoading: false },
                              }));
                            }
                          }}
                          className="h-9 rounded-lg px-3"
                        >
                          <Edit3 className="size-4" />
                        </Button>
                      </div>

                      {/* Refinement UI */}
                      {refineStates[tweet.id] && (
                        <div className="w-full space-y-2 pt-2 border-t border-border/40">
                          <div className="flex flex-wrap gap-1">
                            {quickRefinements.map((preset) => (
                              <button
                                key={preset}
                                type="button"
                                onClick={() => refineTweet(tweet.id, tweet.text, preset)}
                                disabled={refineStates[tweet.id]?.isLoading}
                                className="rounded-full border border-border/40 px-2 py-0.5 text-[10px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
                              >
                                {preset}
                              </button>
                            ))}
                          </div>
                          <div className="flex gap-2">
                            <input
                              type="text"
                              placeholder="Custom instruction..."
                              value={refineStates[tweet.id]?.instruction ?? ""}
                              onChange={(e) =>
                                setRefineStates((prev) => ({
                                  ...prev,
                                  [tweet.id]: { ...prev[tweet.id], instruction: e.target.value },
                                }))
                              }
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  refineTweet(tweet.id, tweet.text, refineStates[tweet.id]?.instruction ?? "");
                                }
                              }}
                              className="flex-1 rounded-lg border border-border/70 bg-background/70 px-3 py-1.5 text-xs outline-none focus:border-primary"
                            />
                            <Button
                              type="button"
                              size="sm"
                              onClick={() => refineTweet(tweet.id, tweet.text, refineStates[tweet.id]?.instruction ?? "")}
                              disabled={refineStates[tweet.id]?.isLoading}
                              className="h-8 rounded-lg px-3"
                            >
                              {refineStates[tweet.id]?.isLoading ? (
                                <LoaderCircle className="size-3 animate-spin" />
                              ) : (
                                <WandSparkles className="size-3" />
                              )}
                            </Button>
                          </div>
                          {refineStates[tweet.id]?.refinedText && (
                            <div className="rounded-lg border border-primary/20 bg-primary/5 p-2">
                              <p className="text-[11px] text-muted-foreground mb-1">✨ Refined version:</p>
                              <p className="whitespace-pre-wrap text-xs leading-relaxed">{refineStates[tweet.id]?.refinedText}</p>
                            </div>
                          )}
                        </div>
                      )}
                    </CardFooter>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Thread Tweets Display */}
          {threadTweets.length > 0 && (
            <div className="mt-6">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="font-heading text-lg font-semibold sm:text-xl flex items-center gap-2">
                  <Repeat2 className="size-5" />
                  Generated Thread ({threadTweets.length} tweets)
                </h2>
                <Button variant="outline" onClick={() => setThreadTweets([])} className="rounded-lg text-xs">
                  Clear Thread
                </Button>
              </div>

              <div className="space-y-4">
                {threadTweets.map((tweet, index) => (
                  <Card
                    key={tweet.id}
                    className={cn(
                      "rounded-2xl border border-border/60 bg-card/90 transition-transform",
                      "hover:-translate-y-0.5 active:translate-y-0",
                      "relative",
                    )}
                  >
                    {/* Thread connector line */}
                    {index < threadTweets.length - 1 && (
                      <div className="absolute -bottom-4 left-6 w-0.5 h-4 bg-border/50" />
                    )}
                    <CardHeader className="pb-2">
                      <CardTitle className="flex items-center justify-between">
                        <span className="flex items-center gap-2">
                          <Badge variant="outline" className="rounded-full">
                            {index + 1}/{threadTweets.length}
                          </Badge>
                          Tweet {index + 1}
                        </span>
                        <Badge variant="outline" className="rounded-full">
                          {tweet.charCount}/280
                        </Badge>
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="whitespace-pre-wrap text-sm leading-relaxed">{tweet.text}</p>
                    </CardContent>
                    <CardFooter className="justify-end gap-2 border-t border-border/60">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => copyTweet(tweet)}
                        className="h-9 rounded-lg px-4"
                      >
                        {copiedId === tweet.id ? (
                          <>
                            <CheckCheck className="size-4 text-emerald-600" />
                            Copied
                          </>
                        ) : (
                          <>
                            <Copy className="size-4" />
                            Copy
                          </>
                        )}
                      </Button>
                    </CardFooter>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
