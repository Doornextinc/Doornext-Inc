import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { MessageCircle, Send, Loader2, ChevronDown, RotateCcw } from "lucide-react";
import { useOrderMessages } from "@/hooks/useOrderMessages";
import { useAuth } from "@/contexts/AuthContext";
import { format } from "date-fns";

interface OrderChatProps {
  orderId: string;
  recipientId: string;
  recipientName: string;
  senderRole: "driver" | "customer" | "seller";
}

interface OptimisticMessage {
  id: string;
  content: string;
  created_at: string;
  sender_id: string;
  sender_role: string;
  is_read: boolean | null;
  status: "sending" | "sent" | "failed";
}

export function OrderChat({ orderId, recipientId, recipientName, senderRole }: OrderChatProps) {
  const { user } = useAuth();
  const { messages, sending, unreadCount, sendMessage, markAsRead } = useOrderMessages(orderId, recipientId);
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [optimistic, setOptimistic] = useState<OptimisticMessage[]>([]);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [newMsgCount, setNewMsgCount] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevMsgCount = useRef(0);

  // Smart scroll: only auto-scroll if user is already at bottom
  const scrollToBottom = useCallback((force = false) => {
    const el = scrollRef.current;
    if (!el) return;
    if (force || isAtBottom) {
      requestAnimationFrame(() => el.scrollTo({ top: el.scrollHeight, behavior: "smooth" }));
    }
  }, [isAtBottom]);

  // Track scroll position
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    setIsAtBottom(atBottom);
    if (atBottom) setNewMsgCount(0);
  }, []);

  useEffect(() => {
    if (open) {
      markAsRead();
      scrollToBottom(true);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const newCount = messages.length - prevMsgCount.current;
    if (newCount > 0 && prevMsgCount.current > 0) {
      if (isAtBottom) {
        scrollToBottom();
      } else {
        setNewMsgCount(prev => prev + newCount);
      }
      // Remove matching optimistic messages now confirmed by server
      const latestContent = messages[messages.length - 1]?.content;
      setOptimistic(prev => prev.filter(o => o.status !== "sent" || o.content !== latestContent));
    }
    prevMsgCount.current = messages.length;
  }, [messages.length, open]);

  const handleSend = async () => {
    if (!text.trim() || !user) return;
    const content = text.trim();
    setText("");

    // Optimistic message
    const tempId = `opt-${Date.now()}`;
    const optimisticMsg: OptimisticMessage = {
      id: tempId,
      content,
      created_at: new Date().toISOString(),
      sender_id: user.id,
      sender_role: senderRole,
      is_read: false,
      status: "sending",
    };
    setOptimistic(prev => [...prev, optimisticMsg]);
    scrollToBottom(true);

    try {
      await sendMessage(content, senderRole);
      setOptimistic(prev => prev.map(o => o.id === tempId ? { ...o, status: "sent" } : o));
      // Server message will arrive via realtime and remove this
      setTimeout(() => setOptimistic(prev => prev.filter(o => o.id !== tempId)), 3000);
    } catch {
      setOptimistic(prev => prev.map(o => o.id === tempId ? { ...o, status: "failed" } : o));
    }
  };

  const retryMessage = async (msg: OptimisticMessage) => {
    setOptimistic(prev => prev.map(o => o.id === msg.id ? { ...o, status: "sending" } : o));
    try {
      await sendMessage(msg.content, senderRole);
      setOptimistic(prev => prev.filter(o => o.id !== msg.id));
    } catch {
      setOptimistic(prev => prev.map(o => o.id === msg.id ? { ...o, status: "failed" } : o));
    }
  };

  const allMessages = [
    ...messages.map(m => ({ ...m, status: "sent" as const, isOptimistic: false })),
    ...optimistic
      .filter(o => !messages.some(m => m.content === o.content && m.sender_id === o.sender_id))
      .map(o => ({ ...o, conversation_id: "", order_id: orderId, sender_type: senderRole, is_system: false, message_type: "text", isOptimistic: true })),
  ].sort((a, b) => new Date(a.created_at ?? 0).getTime() - new Date(b.created_at ?? 0).getTime());

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
          <Button variant="outline" size="sm" className="relative">
            <MessageCircle className="h-4 w-4 mr-1" />
            Chat
            <AnimatePresence>
              {unreadCount > 0 && (
                <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} transition={{ type: "spring" }} className="absolute -top-2 -right-2">
                  <motion.div animate={{ scale: [1, 1.15, 1] }} transition={{ duration: 1.5, repeat: Infinity }}>
                    <Badge variant="destructive" className="h-5 w-5 p-0 flex items-center justify-center text-xs">{unreadCount}</Badge>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
          </Button>
        </motion.div>
      </SheetTrigger>

      <SheetContent side="bottom" className="h-[70vh] flex flex-col">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5" />
            Chat with {recipientName}
          </SheetTitle>
        </SheetHeader>

        <div className="relative flex-1 overflow-hidden">
          <div ref={scrollRef} onScroll={handleScroll} className="h-full overflow-y-auto space-y-2 py-4 px-1">
            {allMessages.length === 0 && (
              <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center text-sm text-muted-foreground py-8">
                No messages yet. Start the conversation!
              </motion.p>
            )}
            <AnimatePresence initial={false}>
              {allMessages.map((msg) => {
                const isMine = msg.sender_id === user?.id;
                const isSystem = msg.sender_role === "system";
                const isFailed = (msg as any).status === "failed";
                const isSending = (msg as any).status === "sending";

                if (isSystem) return (
                  <motion.div key={msg.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex justify-center my-1">
                    <div className="bg-muted/60 border border-border/40 rounded-full px-4 py-1.5 text-xs text-muted-foreground text-center max-w-[85%]">
                      <span>{msg.content}</span>
                      <span className="ml-2 opacity-60">{format(new Date(msg.created_at ?? 0), "h:mm a")}</span>
                    </div>
                  </motion.div>
                );

                return (
                  <motion.div key={msg.id} initial={{ opacity: 0, y: 12, scale: 0.94 }} animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                    className={`flex flex-col ${isMine ? "items-end" : "items-start"}`}
                  >
                    <div className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm transition-opacity ${
                      isMine ? "bg-primary text-primary-foreground" : "bg-muted"
                    } ${isSending ? "opacity-60" : ""} ${isFailed ? "opacity-40" : ""}`}>
                      <p>{msg.content}</p>
                      <p className={`text-[10px] mt-1 ${isMine ? "text-primary-foreground/60" : "text-muted-foreground"}`}>
                        {isSending ? "Sending…" : isFailed ? "Failed" : format(new Date(msg.created_at ?? 0), "h:mm a")}
                      </p>
                    </div>
                    {/* Retry button for failed messages */}
                    {isFailed && (
                      <motion.button initial={{ opacity: 0 }} animate={{ opacity: 1 }} onClick={() => retryMessage(msg as any)}
                        className="flex items-center gap-1 text-xs text-destructive mt-1 hover:underline">
                        <RotateCcw className="h-3 w-3" />Tap to retry
                      </motion.button>
                    )}
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>

          {/* Scroll-to-bottom badge */}
          <AnimatePresence>
            {!isAtBottom && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}
                className="absolute bottom-3 left-1/2 -translate-x-1/2">
                <Button size="sm" variant="secondary" className="rounded-full shadow-lg gap-1.5 h-8 text-xs"
                  onClick={() => { scrollToBottom(true); setNewMsgCount(0); }}>
                  <ChevronDown className="h-3.5 w-3.5" />
                  {newMsgCount > 0 ? `${newMsgCount} new` : "Scroll down"}
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="flex gap-2 pt-2 border-t">
          <Input
            placeholder="Type a message..."
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
          />
          <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.9 }}>
            <Button size="icon" onClick={handleSend} disabled={sending || !text.trim()}>
              <AnimatePresence mode="wait">
                {sending
                  ? <motion.div key="l" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}><Loader2 className="h-4 w-4 animate-spin" /></motion.div>
                  : <motion.div key="s" initial={{ scale: 0, rotate: -30 }} animate={{ scale: 1, rotate: 0 }} exit={{ scale: 0 }}><Send className="h-4 w-4" /></motion.div>
                }
              </AnimatePresence>
            </Button>
          </motion.div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
