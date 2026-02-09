'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { callAIAgent, extractText } from '@/lib/aiAgent'
import { useRAGKnowledgeBase } from '@/lib/ragKnowledgeBase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Loader2, X, Send, Phone, PhoneOff, Mic, MicOff, Settings, Menu, Download, FileText, Upload, Trash2, RefreshCw, Check, AlertCircle, PhoneCall, Volume2 } from 'lucide-react'

// ============================================================================
// Constants
// ============================================================================

const AGENT_ID = '6989d4262b8988571c784a1e'
const RAG_ID = '6989d410de7de278e55d2dfb'
const SETTINGS_KEY = 'voice_agent_settings'
const VOICE_SESSION_URL = 'https://voice-sip.voice.lyzr.app/session/start'
const AUDIO_SAMPLE_RATE = 24000

// ============================================================================
// Types
// ============================================================================

interface CallRecord {
  id: string
  caller: string
  phone: string
  time: string
  duration: string
  status: 'Resolved' | 'Escalated' | 'Missed'
  sentiment: 'Positive' | 'Neutral' | 'Negative'
  transcript: TranscriptEntry[]
}

interface TranscriptEntry {
  speaker: 'Agent' | 'Customer'
  text: string
  time: string
}

interface ChatMessage {
  role: 'user' | 'agent'
  text: string
  timestamp: string
}

interface AgentSettings {
  greeting: string
  escalationTriggers: { label: string; enabled: boolean }[]
  businessHours: { enabled: boolean; start: string; end: string }
}

interface VoiceTranscriptEntry {
  speaker: 'agent' | 'user'
  text: string
  timestamp: string
}

type CallState = 'idle' | 'connecting' | 'active' | 'ending'

// ============================================================================
// Mock Data
// ============================================================================

const MOCK_METRICS = {
  totalCalls: 47,
  avgDuration: '4m 32s',
  resolutionRate: 89,
  activeCalls: 2,
}

const MOCK_CALLS: CallRecord[] = [
  {
    id: '1', caller: 'Sarah Johnson', phone: '+1 (555) 234-8901', time: '10:42 AM',
    duration: '5m 18s', status: 'Resolved', sentiment: 'Positive',
    transcript: [
      { speaker: 'Agent', text: 'Hello! Thank you for calling. How can I help you today?', time: '10:42:00' },
      { speaker: 'Customer', text: 'Hi, I need to check the status of my recent order #45821.', time: '10:42:15' },
      { speaker: 'Agent', text: 'Of course! Let me look that up for you. Your order #45821 was shipped yesterday and is currently in transit. Expected delivery is Thursday.', time: '10:42:30' },
      { speaker: 'Customer', text: 'Perfect, thank you so much!', time: '10:43:00' },
      { speaker: 'Agent', text: 'You\'re welcome! Is there anything else I can help with?', time: '10:43:10' },
      { speaker: 'Customer', text: 'No, that\'s all. Have a great day!', time: '10:43:20' },
    ],
  },
  {
    id: '2', caller: 'Michael Chen', phone: '+1 (555) 876-1234', time: '10:15 AM',
    duration: '8m 45s', status: 'Escalated', sentiment: 'Negative',
    transcript: [
      { speaker: 'Agent', text: 'Hello! Thank you for calling. How can I help you today?', time: '10:15:00' },
      { speaker: 'Customer', text: 'I\'ve been having issues with my billing for the past three months and nobody has fixed it.', time: '10:15:20' },
      { speaker: 'Agent', text: 'I\'m sorry to hear about that frustration. Let me review your account right away.', time: '10:15:40' },
      { speaker: 'Customer', text: 'I want to speak with a manager. This has gone on too long.', time: '10:17:00' },
      { speaker: 'Agent', text: 'I completely understand. Let me transfer you to a senior specialist who can resolve this immediately.', time: '10:17:15' },
    ],
  },
  {
    id: '3', caller: 'Emily Rodriguez', phone: '+1 (555) 345-6789', time: '9:58 AM',
    duration: '3m 22s', status: 'Resolved', sentiment: 'Positive',
    transcript: [
      { speaker: 'Agent', text: 'Hello! Thank you for calling. How can I help you today?', time: '9:58:00' },
      { speaker: 'Customer', text: 'I\'d like to know about your return policy for electronics.', time: '9:58:15' },
      { speaker: 'Agent', text: 'Our electronics return policy allows returns within 30 days of purchase in original packaging. Would you like me to start a return for you?', time: '9:58:30' },
      { speaker: 'Customer', text: 'That\'s helpful. I\'ll think about it. Thanks!', time: '9:59:00' },
    ],
  },
  {
    id: '4', caller: 'David Kim', phone: '+1 (555) 567-2345', time: '9:30 AM',
    duration: '0m 0s', status: 'Missed', sentiment: 'Neutral',
    transcript: [],
  },
  {
    id: '5', caller: 'Jessica Williams', phone: '+1 (555) 789-4567', time: '9:12 AM',
    duration: '6m 11s', status: 'Resolved', sentiment: 'Neutral',
    transcript: [
      { speaker: 'Agent', text: 'Hello! Thank you for calling. How can I help you today?', time: '9:12:00' },
      { speaker: 'Customer', text: 'I need to update my shipping address on file.', time: '9:12:15' },
      { speaker: 'Agent', text: 'I can help with that. Could you please verify your account email first?', time: '9:12:30' },
      { speaker: 'Customer', text: 'Sure, it\'s jessica.w@email.com', time: '9:12:45' },
      { speaker: 'Agent', text: 'Verified. What\'s the new shipping address?', time: '9:13:00' },
      { speaker: 'Customer', text: '742 Maple Street, Suite 4B, Portland, OR 97201', time: '9:13:20' },
      { speaker: 'Agent', text: 'Your address has been updated successfully. Is there anything else?', time: '9:14:00' },
    ],
  },
  {
    id: '6', caller: 'Robert Taylor', phone: '+1 (555) 123-7890', time: '8:45 AM',
    duration: '4m 55s', status: 'Resolved', sentiment: 'Positive',
    transcript: [
      { speaker: 'Agent', text: 'Hello! Thank you for calling. How can I help you today?', time: '8:45:00' },
      { speaker: 'Customer', text: 'Hi, I want to renew my subscription.', time: '8:45:15' },
      { speaker: 'Agent', text: 'I\'d be happy to help! Your current plan is the Pro tier at $29.99/month. Would you like to continue with the same plan?', time: '8:45:30' },
      { speaker: 'Customer', text: 'Yes please, same plan.', time: '8:46:00' },
      { speaker: 'Agent', text: 'Done! Your subscription has been renewed for another year. You\'ll receive a confirmation email shortly.', time: '8:46:15' },
    ],
  },
  {
    id: '7', caller: 'Amanda Foster', phone: '+1 (555) 432-1098', time: '8:22 AM',
    duration: '7m 33s', status: 'Escalated', sentiment: 'Negative',
    transcript: [
      { speaker: 'Agent', text: 'Hello! Thank you for calling. How can I help you today?', time: '8:22:00' },
      { speaker: 'Customer', text: 'My product arrived damaged and I want a full refund immediately.', time: '8:22:20' },
      { speaker: 'Agent', text: 'I\'m very sorry about that. Can you describe the damage?', time: '8:22:35' },
      { speaker: 'Customer', text: 'The screen is cracked and the box was crushed. This is unacceptable.', time: '8:23:00' },
      { speaker: 'Agent', text: 'I completely understand your frustration. Let me escalate this to our returns team for priority processing.', time: '8:23:15' },
    ],
  },
  {
    id: '8', caller: 'Chris Martinez', phone: '+1 (555) 654-3210', time: '8:05 AM',
    duration: '2m 48s', status: 'Resolved', sentiment: 'Positive',
    transcript: [
      { speaker: 'Agent', text: 'Hello! Thank you for calling. How can I help you today?', time: '8:05:00' },
      { speaker: 'Customer', text: 'I just wanted to say the new feature update is amazing. Great job!', time: '8:05:20' },
      { speaker: 'Agent', text: 'Thank you so much for the kind feedback! We\'re glad you\'re enjoying the update. Is there anything else I can help with?', time: '8:05:35' },
      { speaker: 'Customer', text: 'Nope, just wanted to share that. Bye!', time: '8:06:00' },
    ],
  },
]

const SAMPLE_CHAT_MESSAGES: ChatMessage[] = [
  { role: 'user', text: 'Hi, I need help with my account. Can you tell me about your return policy?', timestamp: '10:30 AM' },
  { role: 'agent', text: 'Hello! I\'d be happy to help you with information about our return policy. Our goal is to make returns as smooth and convenient as possible for our customers.\n\nTypically, our return policy allows customers to return most items within 30 days of purchase, provided they are in new, unused condition with the original packaging and tags. However, to ensure I give you the most accurate and up-to-date information, could you tell me a bit more about what specific item you\'re looking to return? This will help me provide you with precise details about the return process.\n\nIs there anything specific about the return you\'d like to know, such as the timeframe, condition requirements, or return method?', timestamp: '10:30 AM' },
  { role: 'user', text: 'What about electronics specifically?', timestamp: '10:31 AM' },
  { role: 'agent', text: 'Great question! For electronics, we have a slightly different policy. Electronics can be returned within 15 days of purchase, and they must be in their original packaging with all accessories included. Please make sure the item has not been activated or registered. If you need more details, I\'m here to help!', timestamp: '10:31 AM' },
]

const DEFAULT_SETTINGS: AgentSettings = {
  greeting: 'Hello! Thank you for calling. How can I help you today?',
  escalationTriggers: [
    { label: 'Customer requests human agent', enabled: true },
    { label: 'Issue unresolved after 3 attempts', enabled: true },
    { label: 'Negative sentiment detected', enabled: true },
    { label: 'Billing dispute over $500', enabled: false },
    { label: 'Account security concern', enabled: true },
  ],
  businessHours: { enabled: true, start: '08:00', end: '18:00' },
}

// ============================================================================
// Helper Components
// ============================================================================

function VoiceWave() {
  return (
    <div className="flex items-center gap-1 h-6">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="voice-wave-bar w-1 bg-primary rounded-full" style={{ height: '8px' }} />
      ))}
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, string> = {
    Resolved: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    Escalated: 'bg-red-500/20 text-red-400 border-red-500/30',
    Missed: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  }
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${config[status] ?? 'bg-muted text-muted-foreground border-border'}`}>
      {status}
    </span>
  )
}

function SentimentIndicator({ sentiment }: { sentiment: string }) {
  const config: Record<string, { color: string; icon: string }> = {
    Positive: { color: 'text-emerald-400', icon: '+' },
    Neutral: { color: 'text-yellow-400', icon: '~' },
    Negative: { color: 'text-red-400', icon: '-' },
  }
  const c = config[sentiment] ?? config.Neutral
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${c.color}`}>
      <span className="text-sm font-bold">{c.icon}</span>
      {sentiment}
    </span>
  )
}

function MetricCard({ title, value, subtitle, icon }: { title: string; value: string | number; subtitle?: string; icon: React.ReactNode }) {
  return (
    <div className="glass-panel rounded-2xl p-6 border border-border">
      <div className="flex items-start justify-between mb-3">
        <p className="text-sm text-muted-foreground font-medium">{title}</p>
        <div className="text-primary opacity-60">{icon}</div>
      </div>
      <p className="text-3xl font-bold text-foreground tracking-tight">{value}</p>
      {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
    </div>
  )
}

function TranscriptDialog({ call, onClose }: { call: CallRecord; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="glass-panel rounded-2xl border border-border w-full max-w-2xl max-h-[80vh] flex flex-col relative z-10">
        <div className="flex items-center justify-between p-6 border-b border-border">
          <div>
            <h3 className="text-lg font-semibold text-foreground">Call Transcript</h3>
            <p className="text-sm text-muted-foreground">{call.caller} - {call.time} - {call.duration}</p>
          </div>
          <div className="flex items-center gap-3">
            <StatusBadge status={call.status} />
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
        <ScrollArea className="flex-1 p-6">
          <div className="space-y-4">
            {Array.isArray(call?.transcript) && call.transcript.length > 0 ? call.transcript.map((entry, idx) => (
              <div key={idx} className={`flex ${entry.speaker === 'Agent' ? 'justify-start' : 'justify-end'}`}>
                <div className={`max-w-[80%] rounded-2xl px-4 py-3 ${entry.speaker === 'Agent' ? 'bg-primary/10 border border-primary/20' : 'bg-muted/50 border border-border'}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-xs font-semibold ${entry.speaker === 'Agent' ? 'text-primary' : 'text-foreground'}`}>{entry.speaker}</span>
                    <span className="text-xs text-muted-foreground">{entry.time}</span>
                  </div>
                  <p className="text-sm text-foreground">{entry.text}</p>
                </div>
              </div>
            )) : (
              <p className="text-center text-muted-foreground py-8">No transcript available for this call.</p>
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  )
}

// ============================================================================
// Voice Call Panel
// ============================================================================

function VoiceCallPanel({ agentOnline }: { agentOnline: boolean }) {
  const [callState, setCallState] = useState<CallState>('idle')
  const [muted, setMuted] = useState(false)
  const [duration, setDuration] = useState(0)
  const [transcript, setTranscript] = useState<VoiceTranscriptEntry[]>([])
  const [error, setError] = useState<string | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)

  const wsRef = useRef<WebSocket | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const processorRef = useRef<ScriptProcessorNode | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const playbackCtxRef = useRef<AudioContext | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const mutedRef = useRef(false)
  const transcriptEndRef = useRef<HTMLDivElement>(null)

  // Keep mutedRef in sync with muted state
  useEffect(() => {
    mutedRef.current = muted
  }, [muted])

  // Auto-scroll transcript
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [transcript])

  // Duration timer
  useEffect(() => {
    if (callState === 'active') {
      setDuration(0)
      timerRef.current = setInterval(() => setDuration(prev => prev + 1), 1000)
    } else {
      if (timerRef.current) clearInterval(timerRef.current)
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [callState])

  const formatDuration = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0')
    const s = (secs % 60).toString().padStart(2, '0')
    return `${m}:${s}`
  }

  const float32ToPCM16Base64 = (float32: Float32Array): string => {
    const int16 = new Int16Array(float32.length)
    for (let i = 0; i < float32.length; i++) {
      const s = Math.max(-1, Math.min(1, float32[i]))
      int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff
    }
    const bytes = new Uint8Array(int16.buffer)
    let binary = ''
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i])
    }
    return btoa(binary)
  }

  const playAudioBase64 = useCallback((base64Audio: string) => {
    try {
      if (!playbackCtxRef.current || playbackCtxRef.current.state === 'closed') {
        playbackCtxRef.current = new AudioContext({ sampleRate: AUDIO_SAMPLE_RATE })
      }
      const ctx = playbackCtxRef.current
      const binaryStr = atob(base64Audio)
      const bytes = new Uint8Array(binaryStr.length)
      for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i)
      }
      const int16 = new Int16Array(bytes.buffer)
      const float32 = new Float32Array(int16.length)
      for (let i = 0; i < int16.length; i++) {
        float32[i] = int16[i] / (int16[i] < 0 ? 0x8000 : 0x7fff)
      }
      const buffer = ctx.createBuffer(1, float32.length, AUDIO_SAMPLE_RATE)
      buffer.getChannelData(0).set(float32)
      const source = ctx.createBufferSource()
      source.buffer = buffer
      source.connect(ctx.destination)
      source.start()
    } catch {
      // Silently skip playback errors for individual chunks
    }
  }, [])

  const cleanupResources = useCallback(() => {
    // Close WebSocket
    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }

    // Stop audio capture
    if (processorRef.current) {
      processorRef.current.disconnect()
      processorRef.current = null
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(() => {})
      audioContextRef.current = null
    }

    // Stop microphone
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }

    // Close playback context
    if (playbackCtxRef.current && playbackCtxRef.current.state !== 'closed') {
      playbackCtxRef.current.close().catch(() => {})
      playbackCtxRef.current = null
    }
  }, [])

  const endCall = useCallback(() => {
    setCallState('ending')
    cleanupResources()
    setSessionId(null)
    setTimeout(() => setCallState('idle'), 300)
  }, [cleanupResources])

  const startCall = useCallback(async () => {
    if (!agentOnline) return
    setError(null)
    setTranscript([])
    setCallState('connecting')

    try {
      // 1. Start voice session
      const res = await fetch(VOICE_SESSION_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: AGENT_ID }),
      })

      if (!res.ok) {
        throw new Error(`Session start failed (${res.status})`)
      }

      const data = await res.json()
      const wsUrl = data.wsUrl || data.ws_url
      const sid = data.sessionId || data.session_id

      if (!wsUrl) {
        throw new Error('No WebSocket URL returned from session')
      }

      setSessionId(sid || null)

      // 2. Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: AUDIO_SAMPLE_RATE,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      })
      streamRef.current = stream

      // 3. Set up WebSocket
      const ws = new WebSocket(wsUrl)
      wsRef.current = ws

      ws.onopen = () => {
        setCallState('active')

        // 4. Set up audio capture
        const audioCtx = new AudioContext({ sampleRate: AUDIO_SAMPLE_RATE })
        audioContextRef.current = audioCtx
        const source = audioCtx.createMediaStreamSource(stream)
        const processor = audioCtx.createScriptProcessor(4096, 1, 1)
        processorRef.current = processor

        processor.onaudioprocess = (e) => {
          if (wsRef.current?.readyState === WebSocket.OPEN && !mutedRef.current) {
            const inputData = e.inputBuffer.getChannelData(0)
            const base64 = float32ToPCM16Base64(inputData)
            wsRef.current.send(JSON.stringify({
              type: 'audio',
              audio: base64,
              sampleRate: AUDIO_SAMPLE_RATE,
            }))
          }
        }

        source.connect(processor)
        processor.connect(audioCtx.destination)
      }

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data)

          if (msg.type === 'audio' && msg.audio) {
            playAudioBase64(msg.audio)
          }

          if (msg.type === 'transcript') {
            const speaker = msg.role === 'user' ? 'user' : 'agent'
            const text = msg.text || msg.content || msg.transcript || ''
            if (text) {
              setTranscript(prev => {
                // If the last entry is the same speaker and is interim, replace it
                if (msg.is_interim && prev.length > 0 && prev[prev.length - 1].speaker === speaker) {
                  return [...prev.slice(0, -1), {
                    speaker,
                    text,
                    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
                  }]
                }
                return [...prev, {
                  speaker,
                  text,
                  timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
                }]
              })
            }
          }
        } catch {
          // Non-JSON message, ignore
        }
      }

      ws.onerror = () => {
        setError('WebSocket connection error. Please try again.')
        cleanupResources()
        setCallState('idle')
      }

      ws.onclose = () => {
        setCallState(prev => prev === 'active' ? 'idle' : prev)
      }

    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to start call'
      setError(message)
      setCallState('idle')
      cleanupResources()
    }
  }, [agentOnline, playAudioBase64, cleanupResources])

  // Clean up on unmount
  useEffect(() => {
    return () => {
      cleanupResources()
    }
  }, [cleanupResources])

  const toggleMute = useCallback(() => {
    setMuted(prev => !prev)
    if (streamRef.current) {
      streamRef.current.getAudioTracks().forEach(track => {
        track.enabled = muted // Toggle: if currently muted, enable; if unmuted, disable
      })
    }
  }, [muted])

  return (
    <div className="glass-panel rounded-2xl border border-border p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-foreground">Voice Call</h3>
        {callState === 'active' && (
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-400 pulse-live" />
            <span className="text-xs text-emerald-400 font-medium">LIVE</span>
            <span className="text-sm font-mono text-foreground ml-2">{formatDuration(duration)}</span>
          </div>
        )}
        {callState === 'connecting' && (
          <div className="flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin text-primary" />
            <span className="text-xs text-primary font-medium">Connecting...</span>
          </div>
        )}
      </div>

      {/* Idle State */}
      {callState === 'idle' && (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <div className="w-20 h-20 rounded-full bg-primary/15 flex items-center justify-center mb-4 border border-primary/20">
            <PhoneCall className="w-10 h-10 text-primary" />
          </div>
          <p className="text-foreground font-medium mb-1">Start a Voice Call</p>
          <p className="text-xs text-muted-foreground mb-6 max-w-[250px]">
            Initiate a live voice conversation with the AI customer service agent
          </p>
          <Button
            onClick={startCall}
            disabled={!agentOnline}
            size="lg"
            className="gap-2 px-8"
          >
            <Phone className="w-4 h-4" />
            {agentOnline ? 'Start Call' : 'Agent Offline'}
          </Button>
          {error && (
            <div className="flex items-center gap-2 mt-4 text-red-400 text-sm">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>
      )}

      {/* Connecting State */}
      {callState === 'connecting' && (
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mb-4 animate-pulse">
            <Phone className="w-10 h-10 text-primary" />
          </div>
          <p className="text-foreground font-medium">Setting up voice session...</p>
          <p className="text-xs text-muted-foreground mt-1">Requesting microphone access</p>
        </div>
      )}

      {/* Active Call State */}
      {(callState === 'active' || callState === 'ending') && (
        <div className="space-y-4">
          {/* Voice Visualizer */}
          <div className="glass-panel-light rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <VoiceWave />
                <span className="text-xs text-muted-foreground">
                  {muted ? 'Microphone muted' : 'Listening...'}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <Volume2 className="w-3 h-3 text-muted-foreground" />
                <span className="text-[10px] text-muted-foreground">24kHz</span>
              </div>
            </div>

            {/* Live Transcript */}
            <ScrollArea className="max-h-[200px]">
              <div className="space-y-2 text-sm">
                {transcript.length > 0 ? transcript.map((entry, idx) => (
                  <div key={idx} className="flex gap-2">
                    <span className={`font-medium shrink-0 ${entry.speaker === 'agent' ? 'text-primary' : 'text-foreground'}`}>
                      {entry.speaker === 'agent' ? 'Agent:' : 'You:'}
                    </span>
                    <span className="text-muted-foreground">{entry.text}</span>
                  </div>
                )) : (
                  <p className="text-muted-foreground text-xs text-center py-4">
                    Speak to begin the conversation...
                  </p>
                )}
                <div ref={transcriptEndRef} />
              </div>
            </ScrollArea>
          </div>

          {/* Session Info */}
          {sessionId && (
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
              <span>Session: {sessionId.slice(0, 12)}...</span>
            </div>
          )}

          {/* Call Controls */}
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={toggleMute}
              className={`flex-1 border-border ${muted ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30' : 'text-muted-foreground hover:text-foreground'}`}
            >
              {muted ? <MicOff className="w-4 h-4 mr-2" /> : <Mic className="w-4 h-4 mr-2" />}
              {muted ? 'Unmute' : 'Mute'}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={endCall}
              disabled={callState === 'ending'}
              className="flex-1"
            >
              <PhoneOff className="w-4 h-4 mr-2" />
              {callState === 'ending' ? 'Ending...' : 'End Call'}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Dashboard View
// ============================================================================

function DashboardView({ showSample, agentOnline, setActiveAgentId }: { showSample: boolean; agentOnline: boolean; setActiveAgentId: (id: string | null) => void }) {
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const [selectedCall, setSelectedCall] = useState<CallRecord | null>(null)
  const [callFilter, setCallFilter] = useState<string>('All')
  const chatEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (showSample) {
      setChatMessages(SAMPLE_CHAT_MESSAGES)
    } else {
      setChatMessages([])
    }
  }, [showSample])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages])

  const handleSendChat = useCallback(async () => {
    const msg = chatInput.trim()
    if (!msg || chatLoading) return

    const userMsg: ChatMessage = { role: 'user', text: msg, timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }
    setChatMessages(prev => [...prev, userMsg])
    setChatInput('')
    setChatLoading(true)
    setActiveAgentId(AGENT_ID)

    try {
      const result = await callAIAgent(msg, AGENT_ID)
      let text = ''
      if (result?.success) {
        text = extractText(result.response) ||
          (typeof result?.response?.result === 'string' ? result.response.result :
            result?.response?.result?.response ?? result?.response?.message ?? '')
      } else {
        text = result?.error ?? 'Sorry, I could not process your request.'
      }
      const agentMsg: ChatMessage = { role: 'agent', text: text || 'No response received.', timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }
      setChatMessages(prev => [...prev, agentMsg])
    } catch {
      setChatMessages(prev => [...prev, { role: 'agent', text: 'An error occurred. Please try again.', timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }])
    } finally {
      setChatLoading(false)
      setActiveAgentId(null)
    }
  }, [chatInput, chatLoading, setActiveAgentId])

  const displayCalls = showSample ? MOCK_CALLS : []
  const filteredCalls = callFilter === 'All' ? displayCalls : displayCalls.filter(c => c.status === callFilter)
  const metrics = showSample ? MOCK_METRICS : { totalCalls: 0, avgDuration: '0m 0s', resolutionRate: 0, activeCalls: 0 }

  return (
    <div className="flex-1 overflow-auto p-6 space-y-6">
      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard title="Today's Calls" value={metrics.totalCalls} subtitle="Total incoming calls" icon={<Phone className="w-5 h-5" />} />
        <MetricCard title="Avg Duration" value={metrics.avgDuration} subtitle="Average call length" icon={<Mic className="w-5 h-5" />} />
        <MetricCard title="Resolution Rate" value={`${metrics.resolutionRate}%`} subtitle="First-call resolution" icon={<Check className="w-5 h-5" />} />
        <MetricCard title="Active Calls" value={metrics.activeCalls} subtitle="Currently in progress" icon={<PhoneOff className="w-5 h-5" />} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Active Call Panel + Call History (2 cols) */}
        <div className="xl:col-span-2 space-y-6">
          {/* Voice Call Panel */}
          <VoiceCallPanel agentOnline={agentOnline} />

          {/* Call History */}
          <div className="glass-panel rounded-2xl border border-border">
            <div className="flex items-center justify-between p-6 pb-4">
              <h3 className="text-lg font-semibold text-foreground">Call History</h3>
              <div className="flex items-center gap-2">
                {['All', 'Resolved', 'Escalated', 'Missed'].map(f => (
                  <button key={f} onClick={() => setCallFilter(f)} className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${callFilter === f ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:text-foreground'}`}>
                    {f}
                  </button>
                ))}
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left text-xs font-medium text-muted-foreground px-6 py-3">Caller</th>
                    <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Time</th>
                    <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Duration</th>
                    <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Status</th>
                    <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Sentiment</th>
                    <th className="text-right text-xs font-medium text-muted-foreground px-6 py-3">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCalls.length > 0 ? filteredCalls.map(call => (
                    <tr key={call.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                      <td className="px-6 py-3">
                        <div>
                          <p className="text-sm font-medium text-foreground">{call.caller}</p>
                          <p className="text-xs text-muted-foreground">{call.phone}</p>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">{call.time}</td>
                      <td className="px-4 py-3 text-sm text-muted-foreground font-mono">{call.duration}</td>
                      <td className="px-4 py-3"><StatusBadge status={call.status} /></td>
                      <td className="px-4 py-3"><SentimentIndicator sentiment={call.sentiment} /></td>
                      <td className="px-6 py-3 text-right">
                        {call.status !== 'Missed' ? (
                          <button onClick={() => setSelectedCall(call)} className="text-xs text-primary hover:text-primary/80 font-medium transition-colors">
                            View Transcript
                          </button>
                        ) : (
                          <span className="text-xs text-muted-foreground">N/A</span>
                        )}
                      </td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan={6} className="px-6 py-12 text-center text-muted-foreground">
                        {showSample ? 'No calls matching filter.' : 'No call history yet. Enable Sample Data to view demo calls.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Chat Widget (1 col) */}
        <div className="xl:col-span-1">
          <div className="glass-panel rounded-2xl border border-border flex flex-col h-[600px]">
            <div className="p-4 border-b border-border">
              <h3 className="text-sm font-semibold text-foreground">Text Chat (Test Agent)</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Send a message to test the voice agent via text</p>
            </div>
            <ScrollArea className="flex-1 p-4">
              <div className="space-y-3">
                {chatMessages.map((msg, idx) => (
                  <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 ${msg.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted/50 text-foreground border border-border'}`}>
                      <p className="text-sm whitespace-pre-wrap">{msg.text}</p>
                      <p className={`text-[10px] mt-1 ${msg.role === 'user' ? 'text-primary-foreground/60' : 'text-muted-foreground'}`}>{msg.timestamp}</p>
                    </div>
                  </div>
                ))}
                {chatLoading && (
                  <div className="flex justify-start">
                    <div className="bg-muted/50 border border-border rounded-2xl px-4 py-3">
                      <Loader2 className="w-4 h-4 animate-spin text-primary" />
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>
            </ScrollArea>
            <div className="p-4 border-t border-border">
              <div className="flex gap-2">
                <Input
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendChat() } }}
                  placeholder="Type a message..."
                  className="flex-1 bg-muted/30 border-border"
                  disabled={chatLoading}
                />
                <Button onClick={handleSendChat} disabled={chatLoading || !chatInput.trim()} size="icon" className="shrink-0">
                  <Send className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="glass-panel rounded-2xl border border-border p-4 mt-4 space-y-3">
            <h3 className="text-sm font-semibold text-foreground">Quick Actions</h3>
            <Button variant="outline" size="sm" className="w-full justify-start border-border text-muted-foreground hover:text-foreground">
              <Download className="w-4 h-4 mr-2" />
              Export Call History
            </Button>
            <Button variant="outline" size="sm" className="w-full justify-start border-border text-muted-foreground hover:text-foreground">
              <Settings className="w-4 h-4 mr-2" />
              Agent Settings
            </Button>
          </div>
        </div>
      </div>

      {/* Transcript Dialog */}
      {selectedCall && <TranscriptDialog call={selectedCall} onClose={() => setSelectedCall(null)} />}
    </div>
  )
}

// ============================================================================
// Knowledge Base View
// ============================================================================

function KnowledgeBaseView({ showSample: _showSample, setActiveAgentId: _setActiveAgentId }: { showSample: boolean; setActiveAgentId: (id: string | null) => void }) {
  const { documents, loading, error, fetchDocuments, uploadDocument, removeDocuments } = useRAGKnowledgeBase()
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null)
  const [selectedDoc, setSelectedDoc] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetchDocuments(RAG_ID)
  }, [])

  const handleUpload = async (file: File) => {
    setUploadError(null)
    setUploadSuccess(null)
    const validTypes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain']
    if (!validTypes.includes(file.type)) {
      setUploadError('Unsupported file type. Please upload PDF, DOCX, or TXT files.')
      return
    }
    setUploading(true)
    try {
      const result = await uploadDocument(RAG_ID, file)
      if (result?.success) {
        setUploadSuccess(`"${file.name}" uploaded successfully.`)
      } else {
        setUploadError(result?.error ?? 'Upload failed. Please try again.')
      }
    } catch {
      setUploadError('An error occurred during upload.')
    } finally {
      setUploading(false)
    }
  }

  const handleDelete = async (fileName: string) => {
    await removeDocuments(RAG_ID, [fileName])
    if (selectedDoc === fileName) setSelectedDoc(null)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) handleUpload(file)
  }

  const docList = Array.isArray(documents) ? documents : []
  const selectedDocument = docList.find(d => d?.fileName === selectedDoc)

  const fileTypeIcon = (_type: string) => {
    return <FileText className="w-5 h-5" />
  }

  const statusColor = (status?: string) => {
    if (status === 'active') return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
    if (status === 'processing') return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
    if (status === 'failed') return 'bg-red-500/20 text-red-400 border-red-500/30'
    return 'bg-muted text-muted-foreground border-border'
  }

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-full">
        {/* Document List */}
        <div className="lg:col-span-2 glass-panel rounded-2xl border border-border flex flex-col">
          <div className="flex items-center justify-between p-6 pb-4 border-b border-border">
            <div>
              <h3 className="text-lg font-semibold text-foreground">Knowledge Base Documents</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Manage documents used by the voice agent for answering questions</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => fetchDocuments(RAG_ID)} disabled={loading} className="border-border text-muted-foreground hover:text-foreground">
              <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
          <ScrollArea className="flex-1">
            {loading && docList.length === 0 ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-6 h-6 animate-spin text-primary mr-3" />
                <span className="text-muted-foreground">Loading documents...</span>
              </div>
            ) : docList.length > 0 ? (
              <div className="divide-y divide-border/50">
                {docList.map((doc, idx) => (
                  <div key={doc?.id ?? idx} onClick={() => setSelectedDoc(doc?.fileName ?? null)} className={`flex items-center gap-4 px-6 py-4 cursor-pointer transition-colors hover:bg-muted/20 ${selectedDoc === doc?.fileName ? 'bg-primary/5 border-l-2 border-l-primary' : ''}`}>
                    <div className="text-muted-foreground">{fileTypeIcon(doc?.fileType ?? '')}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{doc?.fileName ?? 'Unknown'}</p>
                      <div className="flex items-center gap-3 mt-0.5">
                        <span className="text-xs text-muted-foreground uppercase">{doc?.fileType ?? 'N/A'}</span>
                        {doc?.fileSize != null && <span className="text-xs text-muted-foreground">{(doc.fileSize / 1024).toFixed(1)} KB</span>}
                        {doc?.uploadedAt && <span className="text-xs text-muted-foreground">{new Date(doc.uploadedAt).toLocaleDateString()}</span>}
                      </div>
                    </div>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${statusColor(doc?.status)}`}>
                      {doc?.status ?? 'unknown'}
                    </span>
                    <button onClick={(e) => { e.stopPropagation(); handleDelete(doc?.fileName ?? '') }} className="text-muted-foreground hover:text-red-400 transition-colors p-1">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-center px-6">
                <FileText className="w-12 h-12 text-muted-foreground/30 mb-4" />
                <p className="text-muted-foreground font-medium">No documents found</p>
                <p className="text-xs text-muted-foreground mt-1">Upload documents to build the agent's knowledge base</p>
              </div>
            )}
          </ScrollArea>
          {error && (
            <div className="p-4 border-t border-border">
              <div className="flex items-center gap-2 text-red-400 text-sm">
                <AlertCircle className="w-4 h-4" />
                <span>{error}</span>
              </div>
            </div>
          )}
        </div>

        {/* Upload Zone + Document Details */}
        <div className="space-y-6">
          {/* Upload Zone */}
          <div className="glass-panel rounded-2xl border border-border p-6">
            <h3 className="text-sm font-semibold text-foreground mb-4">Upload Document</h3>
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${dragOver ? 'border-primary bg-primary/5' : 'border-border hover:border-muted-foreground/40'}`}
            >
              <Upload className={`w-8 h-8 mx-auto mb-3 ${dragOver ? 'text-primary' : 'text-muted-foreground'}`} />
              <p className="text-sm text-foreground font-medium">Drop files here or click to browse</p>
              <p className="text-xs text-muted-foreground mt-1">Supports PDF, DOCX, TXT</p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx,.txt"
              onChange={(e) => { const file = e.target.files?.[0]; if (file) handleUpload(file); e.target.value = '' }}
              className="hidden"
            />
            {uploading && (
              <div className="flex items-center gap-2 mt-3 text-primary text-sm">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Uploading and processing...</span>
              </div>
            )}
            {uploadError && (
              <div className="flex items-center gap-2 mt-3 text-red-400 text-sm">
                <AlertCircle className="w-4 h-4" />
                <span>{uploadError}</span>
              </div>
            )}
            {uploadSuccess && (
              <div className="flex items-center gap-2 mt-3 text-emerald-400 text-sm">
                <Check className="w-4 h-4" />
                <span>{uploadSuccess}</span>
              </div>
            )}
          </div>

          {/* Document Details */}
          <div className="glass-panel rounded-2xl border border-border p-6">
            <h3 className="text-sm font-semibold text-foreground mb-4">Document Details</h3>
            {selectedDocument ? (
              <div className="space-y-3">
                <div>
                  <p className="text-xs text-muted-foreground">File Name</p>
                  <p className="text-sm text-foreground font-medium">{selectedDocument?.fileName ?? 'N/A'}</p>
                </div>
                <Separator className="bg-border" />
                <div>
                  <p className="text-xs text-muted-foreground">Type</p>
                  <p className="text-sm text-foreground uppercase">{selectedDocument?.fileType ?? 'N/A'}</p>
                </div>
                <Separator className="bg-border" />
                <div>
                  <p className="text-xs text-muted-foreground">Status</p>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border mt-1 ${statusColor(selectedDocument?.status)}`}>
                    {selectedDocument?.status ?? 'unknown'}
                  </span>
                </div>
                {selectedDocument?.fileSize != null && (
                  <>
                    <Separator className="bg-border" />
                    <div>
                      <p className="text-xs text-muted-foreground">Size</p>
                      <p className="text-sm text-foreground">{(selectedDocument.fileSize / 1024).toFixed(1)} KB</p>
                    </div>
                  </>
                )}
                {selectedDocument?.uploadedAt && (
                  <>
                    <Separator className="bg-border" />
                    <div>
                      <p className="text-xs text-muted-foreground">Uploaded</p>
                      <p className="text-sm text-foreground">{new Date(selectedDocument.uploadedAt).toLocaleString()}</p>
                    </div>
                  </>
                )}
                <Separator className="bg-border" />
                <Button variant="destructive" size="sm" className="w-full mt-2" onClick={() => handleDelete(selectedDocument?.fileName ?? '')}>
                  <Trash2 className="w-4 h-4 mr-2" />
                  Remove Document
                </Button>
              </div>
            ) : (
              <div className="text-center py-6">
                <FileText className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Select a document to view details</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// Settings View
// ============================================================================

function SettingsView() {
  const [settings, setSettings] = useState<AgentSettings>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem(SETTINGS_KEY)
        if (saved) return JSON.parse(saved)
      } catch {}
    }
    return DEFAULT_SETTINGS
  })
  const [saved, setSaved] = useState(false)

  const handleSave = () => {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch {}
  }

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Greeting */}
        <div className="glass-panel rounded-2xl border border-border p-6">
          <h3 className="text-lg font-semibold text-foreground mb-1">Greeting Message</h3>
          <p className="text-xs text-muted-foreground mb-4">The first message the agent speaks when answering a call</p>
          <Textarea
            value={settings.greeting}
            onChange={(e) => setSettings(prev => ({ ...prev, greeting: e.target.value }))}
            rows={3}
            className="bg-muted/30 border-border resize-none"
          />
        </div>

        {/* Escalation Triggers */}
        <div className="glass-panel rounded-2xl border border-border p-6">
          <h3 className="text-lg font-semibold text-foreground mb-1">Escalation Triggers</h3>
          <p className="text-xs text-muted-foreground mb-4">Conditions that trigger automatic transfer to a human agent</p>
          <div className="space-y-3">
            {Array.isArray(settings?.escalationTriggers) && settings.escalationTriggers.map((trigger, idx) => (
              <div key={idx} className="flex items-center justify-between py-2 px-3 rounded-xl bg-muted/20">
                <span className="text-sm text-foreground">{trigger?.label ?? ''}</span>
                <Switch
                  checked={trigger?.enabled ?? false}
                  onCheckedChange={(checked) => {
                    setSettings(prev => ({
                      ...prev,
                      escalationTriggers: prev.escalationTriggers.map((t, i) => i === idx ? { ...t, enabled: checked } : t),
                    }))
                  }}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Business Hours */}
        <div className="glass-panel rounded-2xl border border-border p-6">
          <h3 className="text-lg font-semibold text-foreground mb-1">Business Hours</h3>
          <p className="text-xs text-muted-foreground mb-4">Restrict agent availability to specific hours</p>
          <div className="flex items-center justify-between mb-4">
            <Label htmlFor="bh-toggle" className="text-sm text-foreground">Enable business hours enforcement</Label>
            <Switch
              id="bh-toggle"
              checked={settings?.businessHours?.enabled ?? false}
              onCheckedChange={(checked) => setSettings(prev => ({ ...prev, businessHours: { ...prev.businessHours, enabled: checked } }))}
            />
          </div>
          {settings?.businessHours?.enabled && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">Start Time</Label>
                <Input
                  type="time"
                  value={settings?.businessHours?.start ?? '08:00'}
                  onChange={(e) => setSettings(prev => ({ ...prev, businessHours: { ...prev.businessHours, start: e.target.value } }))}
                  className="bg-muted/30 border-border"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">End Time</Label>
                <Input
                  type="time"
                  value={settings?.businessHours?.end ?? '18:00'}
                  onChange={(e) => setSettings(prev => ({ ...prev, businessHours: { ...prev.businessHours, end: e.target.value } }))}
                  className="bg-muted/30 border-border"
                />
              </div>
            </div>
          )}
        </div>

        {/* Agent Model Info */}
        <div className="glass-panel rounded-2xl border border-border p-6">
          <h3 className="text-lg font-semibold text-foreground mb-1">Agent Model Configuration</h3>
          <p className="text-xs text-muted-foreground mb-4">Read-only information about the underlying AI model</p>
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-muted/20 rounded-xl p-4 text-center">
              <p className="text-xs text-muted-foreground mb-1">Model</p>
              <p className="text-sm font-semibold text-foreground">GPT-4.1</p>
            </div>
            <div className="bg-muted/20 rounded-xl p-4 text-center">
              <p className="text-xs text-muted-foreground mb-1">Temperature</p>
              <p className="text-sm font-semibold text-foreground">0.4</p>
            </div>
            <div className="bg-muted/20 rounded-xl p-4 text-center">
              <p className="text-xs text-muted-foreground mb-1">Provider</p>
              <p className="text-sm font-semibold text-foreground">OpenAI</p>
            </div>
          </div>
        </div>

        {/* Save */}
        <Button onClick={handleSave} className="w-full" size="lg">
          {saved ? <Check className="w-4 h-4 mr-2" /> : null}
          {saved ? 'Settings Saved' : 'Save Settings'}
        </Button>
      </div>
    </div>
  )
}

// ============================================================================
// Main Page Component
// ============================================================================

export default function Home() {
  const [activeView, setActiveView] = useState<'dashboard' | 'knowledge' | 'settings'>('dashboard')
  const [showSample, setShowSample] = useState(false)
  const [agentOnline, setAgentOnline] = useState(true)
  const [activeAgentId, setActiveAgentId] = useState<string | null>(null)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  const navItems = [
    { id: 'dashboard' as const, label: 'Dashboard', icon: <Phone className="w-5 h-5" /> },
    { id: 'knowledge' as const, label: 'Knowledge Base', icon: <FileText className="w-5 h-5" /> },
    { id: 'settings' as const, label: 'Settings', icon: <Settings className="w-5 h-5" /> },
  ]

  return (
    <div className="gradient-bg min-h-screen flex">
      {/* Sidebar */}
      <aside className={`glass-panel border-r border-border flex flex-col transition-all duration-300 ${sidebarCollapsed ? 'w-[72px]' : 'w-[260px]'}`}>
        {/* Logo */}
        <div className="p-5 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/20 flex items-center justify-center shrink-0">
              <Phone className="w-5 h-5 text-primary" />
            </div>
            {!sidebarCollapsed && (
              <div className="overflow-hidden">
                <h1 className="text-base font-bold text-foreground tracking-tight leading-tight">Voice Agent</h1>
                <p className="text-[10px] text-muted-foreground leading-tight">Customer Service</p>
              </div>
            )}
          </div>
        </div>

        {/* Nav Items */}
        <nav className="flex-1 py-4 px-3 space-y-1">
          {navItems.map(item => (
            <button
              key={item.id}
              onClick={() => setActiveView(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${activeView === item.id ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-muted/20'}`}
            >
              {item.icon}
              {!sidebarCollapsed && <span>{item.label}</span>}
            </button>
          ))}
        </nav>

        {/* Agent Status */}
        <div className="p-4 border-t border-border">
          <div className={`flex items-center gap-3 ${sidebarCollapsed ? 'justify-center' : ''}`}>
            <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${agentOnline ? 'bg-emerald-400 pulse-live' : 'bg-muted-foreground'}`} />
            {!sidebarCollapsed && (
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-foreground">{agentOnline ? 'Agent Online' : 'Agent Offline'}</p>
                <p className="text-[10px] text-muted-foreground truncate">Inbound Voice</p>
              </div>
            )}
          </div>
          {!sidebarCollapsed && (
            <div className="flex items-center justify-between mt-3">
              <Label htmlFor="agent-toggle" className="text-xs text-muted-foreground">Status</Label>
              <Switch id="agent-toggle" checked={agentOnline} onCheckedChange={setAgentOnline} />
            </div>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar */}
        <header className="glass-panel-light border-b border-border px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => setSidebarCollapsed(!sidebarCollapsed)} className="text-muted-foreground hover:text-foreground transition-colors">
              <Menu className="w-5 h-5" />
            </button>
            <h2 className="text-lg font-semibold text-foreground">
              {activeView === 'dashboard' ? 'Dashboard' : activeView === 'knowledge' ? 'Knowledge Base' : 'Settings'}
            </h2>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Label htmlFor="sample-toggle" className="text-xs text-muted-foreground">Sample Data</Label>
              <Switch id="sample-toggle" checked={showSample} onCheckedChange={setShowSample} />
            </div>
          </div>
        </header>

        {/* Active View */}
        {activeView === 'dashboard' && (
          <DashboardView showSample={showSample} agentOnline={agentOnline} setActiveAgentId={setActiveAgentId} />
        )}
        {activeView === 'knowledge' && (
          <KnowledgeBaseView showSample={showSample} setActiveAgentId={setActiveAgentId} />
        )}
        {activeView === 'settings' && <SettingsView />}

        {/* Agent Info Footer */}
        <div className="glass-panel-light border-t border-border px-6 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full shrink-0 ${activeAgentId ? 'bg-primary animate-pulse' : agentOnline ? 'bg-emerald-400' : 'bg-muted-foreground'}`} />
                <span className="text-xs text-muted-foreground font-medium">Customer Service Voice Agent</span>
              </div>
              <Separator orientation="vertical" className="h-4 bg-border" />
              <span className="text-xs text-muted-foreground font-mono">{AGENT_ID.slice(0, 12)}...</span>
              <Separator orientation="vertical" className="h-4 bg-border" />
              <span className="text-xs text-muted-foreground">
                {activeAgentId ? 'Processing...' : agentOnline ? 'Ready' : 'Offline'}
              </span>
            </div>
            <span className="text-[10px] text-muted-foreground">Voice (Inbound) | KB: customerservicekbhxbw</span>
          </div>
        </div>
      </div>
    </div>
  )
}
