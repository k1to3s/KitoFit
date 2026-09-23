"use client";

import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import {
  ArrowRight, ArrowUpRight, Check, CheckCircle2, Heart, ImagePlus, LoaderCircle,
  MessageCircle, MoreHorizontal, Plus, Search, Send, ShieldCheck, Sparkles, Trash2, Users, X,
} from "lucide-react";
import {
  COMMUNITY_CATEGORIES, type CommunityCategory, type CommunityComment, type CommunityPost,
} from "@/lib/community";

type Props = { displayName: string; notify: (message: string) => void };
type CategoryFilter = "All posts" | CommunityCategory;

function relativeTime(value: string) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60_000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`;
  if (minutes < 10080) return `${Math.floor(minutes / 1440)}d ago`;
  return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function initials(name: string) {
  return name.split(" ").map((part) => part[0]).slice(0, 2).join("").toUpperCase();
}

async function imageToSmallDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith("image/") || file.size > 8_000_000) throw new Error("Choose an image under 8 MB.");
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new window.Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("That image couldn't be opened."));
      img.src = url;
    });
    const scale = Math.min(1, 1200 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(image.naturalWidth * scale);
    canvas.height = Math.round(image.naturalHeight * scale);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Your browser couldn't process this image.");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const data = canvas.toDataURL("image/jpeg", 0.74);
    if (data.length > 1_400_000) throw new Error("This photo is too large. Try a smaller image.");
    return data;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export default function Community({ displayName, notify }: Props) {
  const [browserId, setBrowserId] = useState("");
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [retry, setRetry] = useState(0);
  const [filter, setFilter] = useState<CategoryFilter>("All posts");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"Latest" | "Popular">("Latest");
  const [composing, setComposing] = useState(false);
  const [postName, setPostName] = useState(displayName);
  const [postTitle, setPostTitle] = useState("");
  const [postBody, setPostBody] = useState("");
  const [postCategory, setPostCategory] = useState<CommunityCategory>("General");
  const [postImage, setPostImage] = useState<string | null>(null);
  const [imageBusy, setImageBusy] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [composeError, setComposeError] = useState("");
  const [openReplies, setOpenReplies] = useState<string | null>(null);
  const [replies, setReplies] = useState<Record<string, CommunityComment[]>>({});
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [replyLoading, setReplyLoading] = useState<string | null>(null);
  const [replySubmitting, setReplySubmitting] = useState<string | null>(null);
  const [replyError, setReplyError] = useState("");
  const [busyLike, setBusyLike] = useState<string | null>(null);

  useEffect(() => {
    let id = "";
    try {
      id = localStorage.getItem("bloom-community-browser-id") || "";
      if (!id) {
        id = crypto.randomUUID();
        localStorage.setItem("bloom-community-browser-id", id);
      }
    } catch { id = crypto.randomUUID(); }
    setBrowserId(id);
    const linkedPost = new URLSearchParams(window.location.search).get("post");
    if (linkedPost) {
      setOpenReplies(linkedPost);
      void loadReplies(linkedPost);
    }
  }, []);

  useEffect(() => {
    if (!browserId) return;
    const controller = new AbortController();
    setLoading(true);
    setLoadError("");
    fetch(`/api/community/posts?browserId=${encodeURIComponent(browserId)}`, { signal: controller.signal, cache: "no-store" })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "The community couldn't load.");
        return data as { posts: CommunityPost[] };
      })
      .then((data) => setPosts(data.posts))
      .catch((error: Error) => { if (error.name !== "AbortError") setLoadError(error.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [browserId, retry]);

  useEffect(() => {
    if (!composing) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setComposing(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [composing]);

  const visiblePosts = useMemo(() => {
    const search = query.toLowerCase().trim();
    return posts.filter((post) =>
      (filter === "All posts" || post.category === filter) &&
      (!search || `${post.title} ${post.body} ${post.author}`.toLowerCase().includes(search)),
    ).sort((a, b) => sort === "Popular"
      ? (b.likeCount + b.commentCount) - (a.likeCount + a.commentCount) || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      : new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [posts, query, filter, sort]);

  async function addPost(event: FormEvent) {
    event.preventDefault();
    if (!browserId || submitting || imageBusy) return;
    setComposeError("");
    setSubmitting(true);
    try {
      const response = await fetch("/api/community/posts", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ browserId, author: postName, title: postTitle, body: postBody, category: postCategory, imageData: postImage }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Your post couldn't be shared.");
      setPosts((current) => [data.post as CommunityPost, ...current]);
      setFilter("All posts"); setQuery(""); setSort("Latest");
      setPostTitle(""); setPostBody(""); setPostImage(null); setComposing(false);
      notify("Your post is live. Thanks for sharing!");
    } catch (error) {
      setComposeError(error instanceof Error ? error.message : "Please try again.");
    } finally { setSubmitting(false); }
  }

  async function attachImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setImageBusy(true); setComposeError("");
    try { setPostImage(await imageToSmallDataUrl(file)); }
    catch (error) { setComposeError(error instanceof Error ? error.message : "Couldn't attach this image."); }
    finally { setImageBusy(false); }
  }

  async function toggleLike(post: CommunityPost) {
    if (!browserId || busyLike) return;
    setBusyLike(post.id);
    try {
      const response = await fetch(`/api/community/posts/${post.id}/like`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ browserId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Couldn't update your reaction.");
      setPosts((current) => current.map((item) => item.id === post.id
        ? { ...item, liked: data.liked, likeCount: data.likeCount } : item));
    } catch (error) { notify(error instanceof Error ? error.message : "Please try again."); }
    finally { setBusyLike(null); }
  }

  async function loadReplies(id: string) {
    setReplyError("");
    setReplyLoading(id);
    try {
      const response = await fetch(`/api/community/posts/${id}/comments`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Replies couldn't load.");
      setReplies((current) => ({ ...current, [id]: data.comments as CommunityComment[] }));
    } catch (error) { setReplyError(error instanceof Error ? error.message : "Please try again."); }
    finally { setReplyLoading(null); }
  }

  function toggleReplies(id: string) {
    if (openReplies === id) { setOpenReplies(null); setReplyError(""); return; }
    setReplyError("");
    setOpenReplies(id);
    if (!replies[id]) void loadReplies(id);
  }

  async function addReply(event: FormEvent, postId: string) {
    event.preventDefault();
    const body = replyDrafts[postId]?.trim();
    if (!browserId || !body || replySubmitting) return;
    setReplySubmitting(postId); setReplyError("");
    try {
      const response = await fetch(`/api/community/posts/${postId}/comments`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ browserId, author: postName.trim() || displayName, body }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Couldn't send your reply.");
      setReplies((current) => ({ ...current, [postId]: [...(current[postId] || []), data.comment as CommunityComment] }));
      setPosts((current) => current.map((post) => post.id === postId ? { ...post, commentCount: post.commentCount + 1 } : post));
      setReplyDrafts((current) => ({ ...current, [postId]: "" }));
    } catch (error) { setReplyError(error instanceof Error ? error.message : "Please try again."); }
    finally { setReplySubmitting(null); }
  }

  async function deletePost(post: CommunityPost) {
    if (!browserId || !window.confirm("Delete your post and its replies? This can't be undone.")) return;
    try {
      const response = await fetch(`/api/community/posts/${post.id}`, {
        method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ browserId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Couldn't remove this post.");
      setPosts((current) => current.filter((item) => item.id !== post.id));
      notify("Your post was removed.");
    } catch (error) { notify(error instanceof Error ? error.message : "Please try again."); }
  }

  async function sharePost(id: string) {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/community?post=${id}`);
      notify("Link copied to clipboard.");
    } catch { notify("Copying isn't available in this browser."); }
  }

  return (
    <div className="community-page page-enter">
      <section className="community-hero">
        <div className="community-hero-copy">
          <span className="eyebrow light-eyebrow"><span className="eyebrow-dot" /> YOUR PEOPLE, YOUR PACE</span>
          <h1>Better, <em>together.</em></h1>
          <p>For the questions, the small wins, and everything in between. Find your people and keep growing.</p>
          <button className="button button-white" onClick={() => setComposing(true)}><Plus size={17} /> Share something <ArrowUpRight size={16} /></button>
          <div className="community-hero-foot"><span className="hero-mini-avatars"><span>J</span><span>M</span><span>A</span></span><span>A kinder way to grow, one day at a time.</span></div>
        </div>
        <div className="community-hero-art"><img src="https://images.pexels.com/photos/16934835/pexels-photo-16934835.jpeg?auto=compress&cs=tinysrgb&fit=crop&w=1000&h=800" alt="Friends enjoying a sunny day together" /><div className="hero-floating-note"><Heart size={15} fill="currentColor" /> You belong here</div></div>
        <div className="hero-spark hero-spark-one">✳</div><div className="hero-spark hero-spark-two">✳</div>
      </section>

      <div className="community-layout">
        <div className="community-main">
          <div className="community-section-heading"><div><span className="eyebrow">THE CONVERSATION</span><h2>Community feed</h2></div><span className="feed-count">{posts.length} {posts.length === 1 ? "post" : "posts"}</span></div>
          <div className="community-toolbar">
            <div className="community-filters" role="group" aria-label="Filter posts">
              {(["All posts", ...COMMUNITY_CATEGORIES] as CategoryFilter[]).map((item) => (
                <button key={item} className={`filter-chip ${filter === item ? "selected" : ""}`} onClick={() => setFilter(item)}>{item}</button>
              ))}
            </div>
            <div className="community-tools"><label className="feed-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search posts" aria-label="Search posts" /></label><select className="feed-sort" value={sort} onChange={(event) => setSort(event.target.value as "Latest" | "Popular")} aria-label="Sort posts"><option>Latest</option><option>Popular</option></select></div>
          </div>

          <button className="quick-compose" onClick={() => setComposing(true)}><span className="avatar avatar-self">{initials(postName || displayName)}</span><span>What&apos;s on your mind, {displayName}?</span><span className="quick-compose-right"><ImagePlus size={18} /><span className="button button-small">Create post <Plus size={15} /></span></span></button>

          {loading ? <div className="feed-loading"><LoaderCircle className="spin" size={24} /><span>Getting the conversation ready...</span></div> : loadError ? <div className="feed-empty"><div className="empty-icon"><Users size={26} /></div><h3>We couldn&apos;t load the community</h3><p>{loadError}</p><button className="button button-primary" onClick={() => setRetry((value) => value + 1)}>Try again <ArrowRight size={16} /></button></div> : visiblePosts.length === 0 ? <div className="feed-empty"><div className="empty-icon"><MessageCircle size={26} /></div><h3>No posts found yet</h3><p>Try another search, or start the conversation yourself.</p><button className="button button-primary" onClick={() => { setQuery(""); setFilter("All posts"); setComposing(true); }}>Write a post <ArrowRight size={16} /></button></div> : (
            <div className="post-list">{visiblePosts.map((post) => <article className="post-card" key={post.id} id={`post-${post.id}`}>
              <div className="post-top"><div className={`avatar ${post.isOfficial ? "avatar-team" : "avatar-member"}`}>{post.isOfficial ? <Sparkles size={19} /> : initials(post.author)}</div><div className="post-author"><div><strong>{post.author}</strong>{post.isOfficial && <span className="team-badge"><Check size={11} /> BLOOM TEAM</span>}</div><span>{relativeTime(post.createdAt)} <span className="post-separator">·</span> <span className="post-category">{post.category}</span></span></div>{post.isOwn ? <button className="icon-quiet post-more" onClick={() => deletePost(post)} aria-label={`Delete ${post.title}`} title="Delete your post"><Trash2 size={17} /></button> : <span className="post-more-static"><MoreHorizontal size={19} /></span>}</div>
              <h3>{post.title}</h3><p className="post-body">{post.body}</p>
              {post.imageData && <img className="post-photo" src={post.imageData} alt={`Shared by ${post.author}`} />}
              <div className="post-actions"><button className={`post-action ${post.liked ? "is-liked" : ""}`} onClick={() => toggleLike(post)} disabled={busyLike === post.id} aria-label={`${post.liked ? "Unlike" : "Like"} ${post.title}`}><Heart size={17} fill={post.liked ? "currentColor" : "none"} /> {post.likeCount} {post.likeCount === 1 ? "like" : "likes"}</button><button className={`post-action ${openReplies === post.id ? "active" : ""}`} onClick={() => toggleReplies(post.id)}><MessageCircle size={17} /> {post.commentCount} {post.commentCount === 1 ? "reply" : "replies"}</button><button className="post-action post-share" onClick={() => sharePost(post.id)}><ArrowUpRight size={17} /> Share</button></div>
              {openReplies === post.id && <div className="replies-panel">
                <div className="replies-heading"><strong>Replies</strong><span>{post.commentCount} total</span></div>
                {replyLoading === post.id ? <div className="reply-loading"><LoaderCircle className="spin" size={16} /> Loading replies...</div> : (replies[post.id] || []).length === 0 && !replyError ? <p className="no-replies">Be the first to reply. A little encouragement goes a long way.</p> : <div className="reply-list">{(replies[post.id] || []).map((reply) => <div className="reply-item" key={reply.id}><div className="avatar avatar-tiny avatar-member">{initials(reply.author)}</div><div className="reply-bubble"><div><strong>{reply.author}</strong><span>{relativeTime(reply.createdAt)}</span></div><p>{reply.body}</p></div></div>)}</div>}
                {replyError && <p className="form-error">{replyError} <button className="text-link" onClick={() => void loadReplies(post.id)}>Retry</button></p>}
                <form className="reply-form" onSubmit={(event) => addReply(event, post.id)}><span className="avatar avatar-tiny avatar-self">{initials(postName || displayName)}</span><input value={replyDrafts[post.id] || ""} maxLength={800} onChange={(event) => setReplyDrafts((current) => ({ ...current, [post.id]: event.target.value }))} placeholder="Write a kind reply..." aria-label="Write a reply" /><button type="submit" disabled={!replyDrafts[post.id]?.trim() || replySubmitting === post.id} aria-label="Send reply">{replySubmitting === post.id ? <LoaderCircle className="spin" size={17} /> : <Send size={17} />}</button></form>
              </div>}
            </article>)}</div>
          )}
        </div>
        <aside className="community-aside"><div className="aside-card guidelines-card"><span className="aside-icon"><ShieldCheck size={19} /></span><h3>Good things grow here.</h3><p>A little kindness makes this space better for everyone.</p><ul><li><CheckCircle2 size={15} /> Be kind and encouraging</li><li><CheckCircle2 size={15} /> Share your own experience</li><li><CheckCircle2 size={15} /> Respect each other&apos;s privacy</li></ul><span className="guidelines-note">We&apos;re all growing at our own pace.</span></div><div className="aside-card prompt-card"><div className="prompt-icon"><Sparkles size={18} /></div><span className="eyebrow">NEED A LITTLE INSPIRATION?</span><h3>Start with a small win.</h3><p>Sometimes the best story is simply that you showed up today.</p><button onClick={() => { setPostCategory("Wins"); setComposing(true); }} className="text-arrow">Share your win <ArrowRight size={16} /></button></div><div className="aside-foot"><Heart size={16} /> Real people. Real progress. No pressure.</div></aside>
      </div>

      {composing && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setComposing(false); }}><div className="modal-dialog compose-modal" role="dialog" aria-modal="true" aria-labelledby="compose-title"><div className="modal-header"><div><span className="eyebrow">YOUR VOICE MATTERS</span><h2 id="compose-title">Share with the community</h2></div><button className="icon-quiet" onClick={() => setComposing(false)} aria-label="Close"><X size={20} /></button></div><form onSubmit={addPost}><div className="compose-author"><span className="avatar avatar-self">{initials(postName || displayName)}</span><div><label htmlFor="post-name">Posting as</label><input id="post-name" value={postName} onChange={(event) => setPostName(event.target.value)} maxLength={40} required placeholder="Your name" /></div></div><div className="field-group"><label htmlFor="post-title">Give your post a title</label><input id="post-title" value={postTitle} onChange={(event) => setPostTitle(event.target.value)} minLength={5} maxLength={120} required placeholder="What's on your mind?" /></div><div className="field-group"><label htmlFor="post-category">Choose a topic</label><select id="post-category" value={postCategory} onChange={(event) => setPostCategory(event.target.value as CommunityCategory)}>{COMMUNITY_CATEGORIES.map((category) => <option key={category}>{category}</option>)}</select></div><div className="field-group"><label htmlFor="post-body">Your story</label><textarea id="post-body" value={postBody} onChange={(event) => setPostBody(event.target.value)} minLength={10} maxLength={1500} required rows={5} placeholder="There's no perfect way to say it. Just start here..." /><span className="field-hint">{postBody.length}/1,500 characters</span></div>{postImage && <div className="compose-image-preview"><img src={postImage} alt="Photo to attach" /><button type="button" onClick={() => setPostImage(null)} aria-label="Remove attached photo"><X size={16} /></button></div>}{composeError && <p className="form-error" role="alert">{composeError}</p>}<div className="compose-footer"><label className="attach-button"><ImagePlus size={18} /> {imageBusy ? "Preparing..." : postImage ? "Change photo" : "Add photo"}<input type="file" accept="image/*" onChange={attachImage} disabled={imageBusy} hidden /></label><button type="submit" className="button button-primary" disabled={submitting || imageBusy}>{submitting ? <LoaderCircle className="spin" size={17} /> : <Send size={16} />} {submitting ? "Posting..." : "Publish post"}</button></div></form></div></div>}
    </div>
  );
}
