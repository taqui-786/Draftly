"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { CheckCheck, Copy, LoaderCircle, Plus, RefreshCw, Save, Sparkles, WandSparkles, Clock } from "lucide-react";
import { Toaster, toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
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

  const canGenerateManual = prompt.trim().length >= 5 && !isLoadingManual;
  const canGenerateFeed = selectedFeedId.length > 0 && !isLoadingFeed;

  const styleTweetCount = useMemo(
    () => styleTweets.filter((tweet) => tweet.tweet.trim().length > 0).length,
    [styleTweets],
  );

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
      } catch (error) {
        console.error(error);
        toast.error("Failed to load initial data.");
      }
    };

    void bootstrap();
  }, []);

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

          {(isLoadingManual || isLoadingFeed) && (
            <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
              {[0, 1, 2].map((index) => (
                <div key={index} className="h-56 animate-pulse rounded-2xl border border-border/60 bg-card/60" />
              ))}
            </div>
          )}

          {!isLoadingManual && !isLoadingFeed && tweets.length === 0 && (
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
                    <CardFooter className="justify-end border-t border-border/60">
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
