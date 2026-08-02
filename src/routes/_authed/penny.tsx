import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { PennyScreen } from '@/components/penny/screen'
import { pennyChat } from '@/lib/penny-chats'
import { uuid7 } from '@/lib/uuid7'

export const Route = createFileRoute('/_authed/penny')({
  staticData: { title: 'Penny', fullBleed: true },
  component: PennyNew,
})

// Fresh chat: the Conversation exists only on this client until the first
// message persists. Its UUIDv7 is minted on mount; the first send hands the
// URL over to /penny/$conversationId (history.replace, so Back never steps
// through a dead composer) while the live Chat instance — and its in-flight
// stream — carries across via the registry.
function PennyNew() {
  const navigate = useNavigate()
  const [conversationId] = useState(uuid7)
  const chat = pennyChat(conversationId)
  return (
    <PennyScreen
      chat={chat}
      onFirstSend={() =>
        void navigate({
          to: '/penny/$conversationId',
          params: { conversationId },
          replace: true,
        })
      }
    />
  )
}
