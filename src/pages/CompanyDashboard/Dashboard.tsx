import SummaryBox from './SummaryBox'
import SummaryGraph from './SummaryGraph'
import CompanyTableOverview from './CompanyTableOverview'
import CompanyCallendarNavibator from './CompanyCallendarNavibator'
import './Dashboard.css'

function Dashboard() {
  return (
    <div className="dash-page">
      <SummaryBox />
      <div className="dash-row-secondary">
        <SummaryGraph />
        <CompanyTableOverview />
        <CompanyCallendarNavibator />
      </div>
    </div>
  )
}

export default Dashboard
