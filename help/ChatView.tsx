import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ChevronLeft, Send, Loader2, MessageCircle, Check, CheckCheck,
  Zap, ImagePlus, X, AlertTriangle,
} from "lucide-react";
import { useChat, ChatMessage } from "@/hooks/useChat";
import { useAuth } from "@/contexts/AuthContext";
import { format, isToday, isYesterday, isSameDay } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const QUICK_REPLIES_DRIVER = [
  "On my way to the restaurant!",
  "I've arrived at the restaurant.",
  "Heading to you now! 🚗",
  "I'm at your door!",
  "Could you confirm your address?",
];

const QUICK_REPLIES_CUSTOMER = [
  "Thanks for the update!",
  "How long until delivery?",
  "Please leave at the door.",
  "Can you call me when you arrive?",
];

function getQuickReplies(role: string) {
  if (role === "driver") return QUICK_REPLIES_DRIVER;
  return QUICK_REPLIES_CUSTOMER;
}

function formatDayHeader(dateStr: string) {
  const d = new Date(dateStr);
  if (isToday(d)) return "Today";
  if (isYesterday(d)) return "Yesterday";
  return format(d, "MMMM d, yyyy");
}

const IMAGE_PREFIX = "[image]";

function isImageMessage(content: string) {
  return content.startsWith(IMAGE_PREFIX);
}

function getImageUrl(content: string) {
  return content.slice(IMAGE_PREFIX.length).trim();
}

interface ChatViewProps {
  orderId: string;
  recipientId: string;
  recipientName: string;
  senderRole: "driver" | "customer";
  onBack?: () => void;
  recipientAvatar?: string | null;
  compact?: boolean;
}

export function ChatView({
  orderId,
  recipientId,
  recipientName,
  senderRole,
  onBack,
  recipientAvatar,
  compact = false,
}: ChatViewProps) {
  const { user } = useAuth();
  const {
    messages, sending, isTyping, sendMessage, markAsRead, broadcastTyping,
  } = useChat({ orderId, recipientId, senderRole });
  const [text, setText] = useState("");
  const [showQuickReplies, setShowQuickReplies] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  useEffect(() => {
    markAsRead();
  }, [markAsRead]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight;
      });
    }
  }, [messages.length, isTyping]);

  const handleSend = async (content?: string) => {
    const msg = content || text;
    if (!msg.trim() && !imageFile) return;

    // If there's an image to upload, send it first
    if (imageFile) {
      await handleImageUpload();
      return;
    }

    setText("");
    setShowQuickReplies(false);
    await sendMessage(msg);
  };

  const handleImageUpload = async () => {
    if (!imageFile || !user) return;
    setUploading(true);
    try {
      const ext = imageFile.name.split(".").pop() || "jpg";
      const path = `${user.id}/${orderId}/${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("chat-images")
        .upload(path, imageFile, { contentType: imageFile.type });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from("chat-images")
        .getPublicUrl(path);

      const imageUrl = urlData.publicUrl;
      const caption = text.trim();
      const messageContent = caption
        ? `${IMAGE_PREFIX}${imageUrl}\n${caption}`
        : `${IMAGE_PREFIX}${imageUrl}`;

      clearImagePreview();
      setText("");
      setShowQuickReplies(false);
      await sendMessage(messageContent);
    } catch (err) {
      console.error("Image upload error:", err);
      toast.error("Failed to send image");
    } finally {
      setUploading(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Only images are supported");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Image must be under 10MB");
      return;
    }

    setImageFile(file);
    const reader = new FileReader();
    reader.onload = () => setImagePreview(reader.result as string);
    reader.readAsDataURL(file);

    // Reset input so same file can be selected again
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const clearImagePreview = () => {
    setImageFile(null);
    setImagePreview(null);
  };

  const handleInputChange = (val: string) => {
    setText(val);
    if (val.trim()) broadcastTyping(true);
  };

  // Group messages by day
  const groupedMessages: { date: string; msgs: ChatMessage[] }[] = [];
  messages.forEach((msg) => {
    const last = groupedMessages[groupedMessages.length - 1];
    if (last && msg.created_at && isSameDay(new Date(last.date), new Date(msg.created_at))) {
      last.msgs.push(msg);
    } else {
      groupedMessages.push({ date: msg.created_at ?? new Date().toISOString(), msgs: [msg] });
    }
  });

  const quickReplies = getQuickReplies(senderRole);
  const height = compact ? "h-[60vh]" : "h-[calc(100vh-8rem)]";

  const renderMessageContent = (msg: ChatMessage, _isMine: boolean) => {
    const content = msg.content ?? "";
    if (isImageMessage(content)) {
      const lines = content.split("\n");
      const url = getImageUrl(lines[0]);
      const caption = lines.slice(1).join("\n").trim();

      return (
        <div className="space-y-1">
          <img
            src={url}
            alt="Shared photo"
            className="rounded-lg max-w-[240px] max-h-[240px] object-cover cursor-pointer hover:opacity-90 transition-opacity"
            onClick={() => setLightboxUrl(url)}
            loading="lazy"
          />
          {caption && <p className="leading-relaxed text-sm">{caption}</p>}
        </div>
      );
    }
    return <p className="leading-relaxed">{content}</p>;
  };

  return (
    <div className={`flex flex-col ${height}`}>
      {/* Header */}
      {onBack && (
        <div className="flex items-center gap-3 pb-3 border-b border-border/30 shrink-0">
          <button
            onClick={onBack}
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-2.5 flex-1 min-w-0">
            <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 overflow-hidden">
              {recipientAvatar ? (
                <img src={recipientAvatar} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="text-sm font-bold text-primary">
                  {recipientName.charAt(0).toUpperCase()}
                </span>
              )}
              <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-green-500 border-2 border-background" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-display font-bold truncate">{recipientName}</p>
              <p className="text-[10px] text-muted-foreground truncate">
                Order #{orderId.slice(0, 8)}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Messages area */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto py-4 px-1 scrollbar-hide"
      >
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/5 mb-3">
              <MessageCircle className="h-7 w-7 text-primary/40" />
            </div>
            <p className="text-sm font-medium">Start a conversation</p>
            <p className="text-xs text-muted-foreground/60 mt-1 max-w-[200px] text-center">
              Use quick replies below or type a message
            </p>
          </div>
        )}

        {groupedMessages.map((group, gi) => (
          <div key={gi}>
            {/* Day separator */}
            <div className="flex items-center gap-3 my-4">
              <div className="flex-1 h-px bg-border/30" />
              <span className="text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wider">
                {formatDayHeader(group.date)}
              </span>
              <div className="flex-1 h-px bg-border/30" />
            </div>

            {group.msgs.map((msg, mi) => {
              const isMine = msg.sender_id === user?.id;
              const isSystem = msg.sender_role === "system" || msg.is_system;
                const showTimestamp =
                mi === group.msgs.length - 1 ||
                group.msgs[mi + 1]?.sender_id !== msg.sender_id ||
                new Date(group.msgs[mi + 1]?.created_at ?? 0).getTime() - new Date(msg.created_at ?? 0).getTime() > 120000;

              if (isSystem) {
                return (
                  <motion.div
                    key={msg.id}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="flex justify-center my-2"
                  >
                    <div className="bg-muted/50 border border-border/30 rounded-full px-4 py-1.5 text-[11px] text-muted-foreground text-center max-w-[85%]">
                      <span>{msg.content ?? ""}</span>
                      <span className="ml-2 opacity-50">
                        {format(new Date(msg.created_at ?? 0), "h:mm a")}
                      </span>
                    </div>
                  </motion.div>
                );
              }

              return (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.15 }}
                  className={`flex ${isMine ? "justify-end" : "justify-start"} mb-0.5`}
                >
                  <div
                    className={`max-w-[78%] rounded-2xl px-3.5 py-2 text-sm ${
                      isMine
                        ? "bg-primary text-primary-foreground rounded-br-md"
                        : "bg-muted rounded-bl-md"
                    } ${isImageMessage(msg.content ?? "") ? "p-1.5" : ""}`}
                  >
                    {renderMessageContent(msg, isMine)}
                    {showTimestamp && (
                      <div
                        className={`flex items-center gap-1 mt-1 ${
                          isMine ? "justify-end" : "justify-start"
                        } ${isImageMessage(msg.content ?? "") ? "px-2 pb-1" : ""}`}
                      >
                        <span
                          className={`text-[10px] ${
                            isMine ? "text-primary-foreground/50" : "text-muted-foreground/50"
                          }`}
                        >
                          {format(new Date(msg.created_at ?? 0), "h:mm a")}
                        </span>
                        {isMine && (
                          msg.is_read ? (
                            <CheckCheck className="h-3 w-3 text-primary-foreground/70" />
                          ) : (
                            <Check className="h-3 w-3 text-primary-foreground/40" />
                          )
                        )}
                      </div>
                    )}
                    {/* Failed send — offer retry */}
                    {msg._failed && isMine && (
                      <button
                        onClick={() => sendMessage(msg.content ?? "")}
                        className="flex items-center gap-1 mt-1 text-[10px] text-red-400 hover:text-red-300 hover:underline transition-colors"
                      >
                        <AlertTriangle className="h-2.5 w-2.5" />
                        Failed — tap to retry
                      </button>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>
        ))}

        {/* Typing indicator */}
        <AnimatePresence>
          {isTyping && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              className="flex justify-start mb-1"
            >
              <div className="bg-muted rounded-2xl rounded-bl-md px-4 py-2.5">
                <div className="flex gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50 animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50 animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50 animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Quick replies */}
      <AnimatePresence>
        {showQuickReplies && messages.length < 3 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="shrink-0 overflow-hidden"
          >
            <div className="flex gap-1.5 pb-2 overflow-x-auto scrollbar-hide">
              <Zap className="h-4 w-4 text-amber-500 shrink-0 mt-1" />
              {quickReplies.map((reply) => (
                <button
                  key={reply}
                  onClick={() => handleSend(reply)}
                  className="shrink-0 rounded-full border border-border/50 bg-muted/30 px-3 py-1.5 text-xs text-foreground hover:bg-muted/60 transition-colors active:scale-95"
                >
                  {reply}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Image preview */}
      <AnimatePresence>
        {imagePreview && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="shrink-0 overflow-hidden"
          >
            <div className="relative inline-block mb-2">
              <img
                src={imagePreview}
                alt="Preview"
                className="h-20 w-20 object-cover rounded-xl border border-border/50"
              />
              <button
                onClick={clearImagePreview}
                className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center shadow-sm"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Input */}
      <div className="flex gap-2 pt-2 border-t border-border/30 shrink-0">
        <input
          type="file"
          ref={fileInputRef}
          accept="image/*"
          className="hidden"
          onChange={handleFileSelect}
        />
        <Button
          size="icon"
          variant="ghost"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading || sending}
          className="shrink-0 rounded-xl text-muted-foreground hover:text-primary"
        >
          <ImagePlus className="h-5 w-5" />
        </Button>
        <Input
          placeholder={imageFile ? "Add a caption…" : "Type a message…"}
          value={text}
          onChange={(e) => handleInputChange(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
          disabled={sending || uploading}
          className="bg-muted/30 border-border/30 rounded-xl"
        />
        <Button
          size="icon"
          onClick={() => handleSend()}
          disabled={(sending || uploading) || (!text.trim() && !imageFile)}
          className="shrink-0 rounded-xl"
        >
          {sending || uploading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </Button>
      </div>

      {/* Lightbox */}
      <AnimatePresence>
        {lightboxUrl && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
            onClick={() => setLightboxUrl(null)}
          >
            <motion.img
              initial={{ scale: 0.8 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.8 }}
              src={lightboxUrl}
              alt="Full size"
              className="max-w-full max-h-full object-contain rounded-lg"
              onClick={(e) => e.stopPropagation()}
            />
            <button
              onClick={() => setLightboxUrl(null)}
              className="absolute top-4 right-4 h-10 w-10 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
