import { useParams } from 'react-router-dom'
import { PageHeader } from '@/ui/components'

export default function TreePage() {
  const { label } = useParams()
  return (
    <div>
      <PageHeader title={label ?? 'Tree'} />
    </div>
  )
}
