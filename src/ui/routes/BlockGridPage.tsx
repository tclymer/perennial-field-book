import { useParams } from 'react-router-dom'
import { PageHeader } from '@/ui/components'

export default function BlockGridPage() {
  const { id } = useParams()
  return (
    <div>
      <PageHeader title="Block grid" subtitle={id} />
    </div>
  )
}
