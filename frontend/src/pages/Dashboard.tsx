import { InstanceSummaryWidget } from '@/components/dashboard/InstanceSummaryWidget'
import { CostEstimateWidget } from '@/components/dashboard/CostEstimateWidget'
import { InstanceGroupsWidget } from '@/components/dashboard/InstanceGroupsWidget'
import { LicenseServerWidget } from '@/components/dashboard/LicenseServerWidget'
import { ActiveSchedulesWidget } from '@/components/dashboard/ActiveSchedulesWidget'
import { RecentActivityWidget } from '@/components/dashboard/RecentActivityWidget'
import { ImagesWidget } from '@/components/dashboard/ImagesWidget'
import { ProjectHealthMiniWidget } from '@/components/dashboard/ProjectHealthMiniWidget'
import { FirewallWidget } from '@/components/dashboard/FirewallWidget'

export default function Dashboard() {
  return (
    <div className="flex flex-col h-full gap-6">
      <div className="page-title-row">
        <h1 className="text-xl font-semibold text-slate-100">Dashboard</h1>
        <p className="text-sm text-slate-400 mt-0.5">Overview of your project</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
        <InstanceSummaryWidget />
        <CostEstimateWidget />
        <InstanceGroupsWidget />
        <LicenseServerWidget />
        <ActiveSchedulesWidget />
        <RecentActivityWidget />
        <ImagesWidget />
        <ProjectHealthMiniWidget />
        <FirewallWidget />
      </div>
    </div>
  )
}
