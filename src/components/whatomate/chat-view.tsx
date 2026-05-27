'use client';

import React, { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Search,
  Send,
  Phone,
  Video,
  MoreVertical,
  Paperclip,
  Smile,
  Check,
  CheckCheck,
  Clock,
  Filter,
  MessageSquare,
  Loader2,
} from 'lucide-react';

interface Conversation {
  id: string;
  contactId: string;
  contactName: string;
  lastMessage: string;
  lastMessageTime: string;
  unreadCount: number;
  status: 'active' | 'resolved' | 'pending';
  assignedTo?: string;
}

interface Message {
  id: string;
  conversationId: string;
  from: string;
  text: string;
  timestamp: string;
  type: 'incoming' | 'outgoing';
  status?: 'sent' | 'delivered' | 'read';
}

export function ChatView() {
  const [selectedConv, setSelectedConv] = useState('');
  const [messageInput, setMessageInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messagesMap, setMessagesMap] = useState<Record<string, Message[]>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/hermes/conversations')
      .then((res) => res.json())
      .then((data) => {
        setConversations(data.conversations || []);
        setMessagesMap(data.messages || {});
        if (data.conversations?.length > 0 && !selectedConv) {
          setSelectedConv(data.conversations[0].id);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [selectedConv]);

  const currentMessages = messagesMap[selectedConv] || [];
  const currentConv = conversations.find(c => c.id === selectedConv);

  const filteredConversations = conversations.filter(
    conv =>
      conv.contactName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      conv.lastMessage.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getStatusIcon = (status?: string) => {
    switch (status) {
      case 'read':
        return <CheckCheck className="w-3.5 h-3.5 text-blue-500" />;
      case 'delivered':
        return <CheckCheck className="w-3.5 h-3.5 text-muted-foreground" />;
      case 'sent':
        return <Check className="w-3.5 h-3.5 text-muted-foreground" />;
      default:
        return <Clock className="w-3.5 h-3.5 text-muted-foreground" />;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-8rem)]">
        <Loader2 className="w-8 h-8 animate-spin text-[#25D366]" />
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-0 border rounded-xl overflow-hidden bg-white shadow-sm">
      {/* Conversation List */}
      <div className="w-full md:w-80 lg:w-96 border-r flex flex-col bg-white">
        {/* List Header */}
        <div className="p-3 border-b">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-base">Chats</h3>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <Filter className="w-4 h-4" />
              </Button>
            </div>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search chats..."
              className="pl-9 h-9 bg-muted/50 border-0"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        {/* Conversation Items */}
        <ScrollArea className="flex-1">
          {filteredConversations.length > 0 ? (
            <div className="divide-y">
              {filteredConversations.map((conv) => (
                <button
                  key={conv.id}
                  onClick={() => setSelectedConv(conv.id)}
                  className={`w-full flex items-center gap-3 p-3 hover:bg-muted/50 transition-colors text-left ${
                    selectedConv === conv.id ? 'bg-[#25D366]/5 border-r-2 border-r-[#25D366]' : ''
                  }`}
                >
                  <Avatar className="h-12 w-12 shrink-0">
                    <AvatarFallback className="bg-[#25D366]/10 text-[#25D366] font-semibold">
                      {conv.contactName.split(' ').map(n => n[0]).join('')}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="font-medium text-sm truncate">{conv.contactName}</p>
                      <span className="text-[11px] text-muted-foreground whitespace-nowrap ml-2">
                        {conv.lastMessageTime}
                      </span>
                    </div>
                    <div className="flex items-center justify-between mt-0.5">
                      <p className="text-xs text-muted-foreground truncate pr-2">
                        {conv.lastMessage}
                      </p>
                      {conv.unreadCount > 0 && (
                        <span className="bg-[#25D366] text-white text-[10px] font-bold min-w-[20px] h-5 flex items-center justify-center rounded-full px-1">
                          {conv.unreadCount}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="p-8 text-center text-muted-foreground text-sm">
              No conversations yet. Connect Hermes to start chatting.
            </div>
          )}
        </ScrollArea>
      </div>

      {/* Chat Area - Hidden on mobile unless conversation is selected */}
      <div className={`flex-1 flex flex-col bg-[#ECE5DD] ${selectedConv ? 'flex' : 'hidden md:flex'}`}>
        {currentConv ? (
          <>
            {/* Chat Header */}
            <div className="h-16 bg-[#075E54] text-white px-4 flex items-center gap-3 shrink-0">
              <Button
                variant="ghost"
                size="icon"
                className="md:hidden text-white hover:bg-white/10"
                onClick={() => setSelectedConv('')}
              >
                ←
              </Button>
              <Avatar className="h-10 w-10">
                <AvatarFallback className="bg-white/20 text-white font-semibold text-sm">
                  {currentConv.contactName.split(' ').map(n => n[0]).join('')}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <p className="font-medium text-sm">{currentConv.contactName}</p>
                <p className="text-xs text-white/60">online</p>
              </div>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" className="text-white hover:bg-white/10">
                  <Phone className="w-5 h-5" />
                </Button>
                <Button variant="ghost" size="icon" className="text-white hover:bg-white/10">
                  <Video className="w-5 h-5" />
                </Button>
                <Button variant="ghost" size="icon" className="text-white hover:bg-white/10">
                  <MoreVertical className="w-5 h-5" />
                </Button>
              </div>
            </div>

            {/* Messages */}
            <ScrollArea className="flex-1 p-4">
              <div className="max-w-2xl mx-auto space-y-2">
                {currentMessages.length > 0 ? (
                  currentMessages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`flex ${msg.type === 'outgoing' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`relative max-w-[75%] px-3 py-2 rounded-lg shadow-sm ${
                          msg.type === 'outgoing'
                            ? 'bg-[#DCF8C6] rounded-tr-none'
                            : 'bg-white rounded-tl-none'
                        }`}
                      >
                        <p className="text-sm leading-relaxed">{msg.text}</p>
                        <div className={`flex items-center gap-1 mt-1 ${msg.type === 'outgoing' ? 'justify-end' : ''}`}>
                          <span className="text-[10px] text-gray-500">{msg.timestamp}</span>
                          {msg.type === 'outgoing' && getStatusIcon(msg.status)}
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center text-muted-foreground text-sm py-8">
                    No messages in this conversation yet
                  </div>
                )}
              </div>
            </ScrollArea>

            {/* Message Input */}
            <div className="bg-[#ECE5DD] px-4 py-3">
              <div className="flex items-center gap-2 max-w-2xl mx-auto">
                <Button variant="ghost" size="icon" className="shrink-0 text-muted-foreground hover:text-foreground">
                  <Smile className="w-5 h-5" />
                </Button>
                <Button variant="ghost" size="icon" className="shrink-0 text-muted-foreground hover:text-foreground">
                  <Paperclip className="w-5 h-5" />
                </Button>
                <div className="flex-1">
                  <Input
                    placeholder="Type a message..."
                    className="bg-white border-0 h-10 rounded-lg"
                    value={messageInput}
                    onChange={(e) => setMessageInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && messageInput.trim()) {
                        setMessageInput('');
                      }
                    }}
                  />
                </div>
                <Button
                  size="icon"
                  className="shrink-0 bg-[#25D366] hover:bg-[#128C7E] text-white rounded-full h-10 w-10"
                  onClick={() => setMessageInput('')}
                  disabled={!messageInput.trim()}
                >
                  <Send className="w-5 h-5" />
                </Button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <MessageSquare className="w-16 h-16 text-muted-foreground/30 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-muted-foreground">Select a conversation</h3>
              <p className="text-sm text-muted-foreground/60 mt-1">Choose a chat to start messaging</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
