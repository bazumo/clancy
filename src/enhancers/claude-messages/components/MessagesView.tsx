import type { Message } from '../types'
import { MessageView } from './MessageView'
import { CollapsibleSection } from '@/components'

interface MessagesViewProps {
  messages: Message[]
  defaultExpanded?: boolean
}

export function MessagesView({ messages, defaultExpanded = true }: MessagesViewProps) {
  return (
    <CollapsibleSection
      title="Messages"
      color="slate"
      defaultExpanded={defaultExpanded}
      contentClassName=""
      headerContent={
        <span className="text-xs text-muted-foreground">
          {messages.length} message{messages.length !== 1 ? 's' : ''}
        </span>
      }
    >
      {messages.map((message, i) => (
        <MessageView key={i} message={message} index={i} defaultExpanded={true} />
      ))}
    </CollapsibleSection>
  )
}
