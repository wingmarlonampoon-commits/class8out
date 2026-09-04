import { useEffect, useState, type CSSProperties } from 'react'
import {
  BookOpen,
  Calendar,
  CalendarCheck,
  CalendarClock,
  CheckCircle2,
  ExternalLink,
  FileText,
  GraduationCap,
  MessageSquare,
  Star,
  Video,
  X,
} from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { useStudentIdentity } from '../../hooks/useStudentIdentity'
import './Classes.css'

type StatusFilter = 'all' | 'booked' | 'completed'

type ClassDetails = {
  subject: string | null
  book_id: string | null
  book_label: string | null
}

type ClassRow = {
  id: string
  date: string
  start_time: string
  Status: 'Booked' | 'Completed'
  class_details: ClassDetails | null
  class_notes: string | null
  class_recording: string | null
  teacher_rating: number | null
  teacher?: {
    id: string
    name: string
  } | null
}

type ExistingFeedback = {
  id: string
  feedback: string
  anonymous: boolean
  teacher_id: string
  class_id: string
}

const pad2 = (n: number) => String(n).padStart(2, '0')

const toDateKey = (d: Date) =>
  `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`

const getMonthRange = (d: Date) => {
  const start = new Date(d.getFullYear(), d.getMonth(), 1)
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0)

  return {
    from: toDateKey(start),
    to: toDateKey(end),
  }
}

const formatDateLabel = (dateKey: string) => {
  const [y, m, d] = dateKey.split('-').map(Number)

  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

const formatTimeLabel = (startTime: string) => {
  const [hStr, mStr] = startTime.split(':')
  const h24 = Number(hStr)

  const period = h24 < 12 ? 'AM' : 'PM'
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12

  return `${h12}:${mStr} ${period}`
}

function Classes() {
  const { identity } = useStudentIdentity()

  const [classes, setClasses] = useState<ClassRow[]>([])
  const [loading, setLoading] = useState(true)

  const defaultRange = getMonthRange(new Date())

  const [dateFrom, setDateFrom] = useState(defaultRange.from)
  const [dateTo, setDateTo] = useState(defaultRange.to)
  const [statusFilter, setStatusFilter] =
    useState<StatusFilter>('all')

  const [selectedClass, setSelectedClass] =
    useState<ClassRow | null>(null)

  // ============================================================
  // FEEDBACK STATE
  // ============================================================

  const [feedbackText, setFeedbackText] = useState('')
  const [anonymous, setAnonymous] = useState(false)
  const [feedbackLoading, setFeedbackLoading] = useState(false)

  const [feedbackCheckLoading, setFeedbackCheckLoading] =
    useState(false)

  const [feedbackMessage, setFeedbackMessage] = useState('')
  const [feedbackError, setFeedbackError] = useState('')

  const [existingFeedback, setExistingFeedback] =
    useState<ExistingFeedback | null>(null)

  // ============================================================
  // LOAD CLASSES
  // ============================================================

  useEffect(() => {
    if (!identity) return

    setLoading(true)

    let query =
      identity.kind === 'freelance'
        ? supabase
            .from('freelance_classes')
            .select(
              'id, date, start_time, "Status", class_details, class_notes, class_recording, teacher_rating',
            )
            .eq('student_id', identity.studentId)
        : supabase
            .from('classes')
            .select(
              'id, date, start_time, "Status", class_details, class_notes, class_recording, teacher_rating, teacher:company_organizational_chart(id, name)',
            )
            .eq('student_id', identity.studentId)

    query = query
      .order('date', { ascending: false })
      .order('start_time', { ascending: false })

    if (dateFrom) {
      query = query.gte('date', dateFrom)
    }

    if (dateTo) {
      query = query.lte('date', dateTo)
    }

    query.then(({ data, error }) => {
      if (error) {
        console.error('Error loading classes:', error)
        setClasses([])
      } else {
        setClasses(
          (data as unknown as ClassRow[]) ?? [],
        )
      }

      setLoading(false)
    })
  }, [identity, dateFrom, dateTo])

  // ============================================================
  // HELPERS
  // ============================================================

  const teacherNameFor = (row: ClassRow) =>
    row.teacher?.name ??
    (identity?.kind === 'freelance'
      ? identity.teacherName
      : '—')

  const filteredClasses = classes.filter((c) => {
    if (statusFilter === 'booked') {
      return c.Status !== 'Completed'
    }

    if (statusFilter === 'completed') {
      return c.Status === 'Completed'
    }

    return true
  })

  const completedCount = classes.filter(
    (c) => c.Status === 'Completed',
  ).length

  const upcomingCount =
    classes.length - completedCount

  const clearDateRange = () => {
    setDateFrom('')
    setDateTo('')
  }

  const resetToThisMonth = () => {
    const range = getMonthRange(new Date())

    setDateFrom(range.from)
    setDateTo(range.to)
  }

  // ============================================================
  // RESET FEEDBACK
  // ============================================================

  const resetFeedbackState = () => {
    setFeedbackText('')
    setAnonymous(false)
    setFeedbackLoading(false)
    setFeedbackCheckLoading(false)
    setFeedbackMessage('')
    setFeedbackError('')
    setExistingFeedback(null)
  }

  // ============================================================
  // CHECK EXISTING FEEDBACK
  // ============================================================

  const checkExistingFeedback = async (
    classRow: ClassRow,
  ) => {
    if (!identity) return

    if (identity.kind === 'freelance') return

    if (classRow.Status !== 'Completed') return

    setFeedbackCheckLoading(true)
    setFeedbackError('')
    setExistingFeedback(null)

    try {
      // --------------------------------------------------------
      // GET STUDENT CODE
      // --------------------------------------------------------

      const {
        data: studentData,
        error: studentError,
      } = await supabase
        .from('student_lists')
        .select('student_code')
        .eq('id', identity.studentId)
        .single()

      if (
        studentError ||
        !studentData?.student_code
      ) {
        console.error(
          'Error fetching student code:',
          studentError,
        )

        setFeedbackError(
          'Unable to identify your student code.',
        )

        return
      }

      const studentCode =
        studentData.student_code

      // --------------------------------------------------------
      // CHECK FEEDBACK FOR THIS SPECIFIC CLASS
      // --------------------------------------------------------

      const {
        data: feedbackData,
        error: feedbackError,
      } = await supabase
        .from('feedback')
        .select(
          'id, feedback, anonymous, teacher_id, class_id',
        )
        .eq('student_code', studentCode)
        .eq('class_id', classRow.id)
        .maybeSingle()

      if (feedbackError) {
        console.error(
          'Error checking existing feedback:',
          feedbackError,
        )

        setFeedbackError(
          'Unable to check your existing feedback.',
        )

        return
      }

      if (feedbackData) {
        setExistingFeedback(
          feedbackData as ExistingFeedback,
        )
      }
    } catch (error) {
      console.error(
        'Unexpected feedback check error:',
        error,
      )

      setFeedbackError(
        'Unable to check your existing feedback.',
      )
    } finally {
      setFeedbackCheckLoading(false)
    }
  }

  // ============================================================
  // OPEN CLASS
  // ============================================================

  const openClass = async (classRow: ClassRow) => {
    setSelectedClass(classRow)

    resetFeedbackState()

    // Feedback only applies to company students
    if (identity?.kind === 'freelance') {
      return
    }

    // Only completed classes can have feedback
    if (classRow.Status !== 'Completed') {
      return
    }

    await checkExistingFeedback(classRow)
  }

  // ============================================================
  // CLOSE CLASS
  // ============================================================

  const closeClass = () => {
    setSelectedClass(null)

    resetFeedbackState()
  }

  // ============================================================
  // SUBMIT FEEDBACK
  // ============================================================

  const submitFeedback = async () => {
    // ----------------------------------------------------------
    // STUDENT IDENTITY
    // ----------------------------------------------------------

    if (!identity) {
      setFeedbackError(
        'Unable to identify the student.',
      )
      return
    }

    // ----------------------------------------------------------
    // FREELANCE STUDENTS
    // ----------------------------------------------------------

    if (identity.kind === 'freelance') {
      setFeedbackError(
        'Feedback is only available for company students.',
      )
      return
    }

    // ----------------------------------------------------------
    // SELECTED CLASS
    // ----------------------------------------------------------

    if (!selectedClass) {
      setFeedbackError(
        'Please select a completed class.',
      )
      return
    }

    // ----------------------------------------------------------
    // CLASS MUST BE COMPLETED
    // ----------------------------------------------------------

    if (selectedClass.Status !== 'Completed') {
      setFeedbackError(
        'Feedback can only be submitted after the class has been completed.',
      )
      return
    }

    // ----------------------------------------------------------
    // TEACHER
    // ----------------------------------------------------------

    if (!selectedClass.teacher?.id) {
      setFeedbackError(
        'Unable to identify the teacher for this class.',
      )
      return
    }

    // ----------------------------------------------------------
    // FEEDBACK TEXT
    // ----------------------------------------------------------

    const trimmedFeedback =
      feedbackText.trim()

    if (!trimmedFeedback) {
      setFeedbackError(
        'Please enter your feedback.',
      )
      return
    }

    // ----------------------------------------------------------
    // ALREADY EXISTS
    // ----------------------------------------------------------

    if (existingFeedback) {
      setFeedbackError(
        'You have already submitted feedback for this class.',
      )
      return
    }

    setFeedbackLoading(true)
    setFeedbackError('')
    setFeedbackMessage('')

    try {
      // ========================================================
      // GET STUDENT CODE
      // ========================================================

      const {
        data: studentData,
        error: studentError,
      } = await supabase
        .from('student_lists')
        .select('student_code')
        .eq('id', identity.studentId)
        .single()

      if (
        studentError ||
        !studentData?.student_code
      ) {
        console.error(
          'Error fetching student code:',
          studentError,
        )

        setFeedbackError(
          'Unable to identify your student code. Please contact support.',
        )

        return
      }

      const studentCode =
        studentData.student_code

      // ========================================================
      // CHECK AGAIN BEFORE INSERT
      // ========================================================

      const {
        data: duplicateFeedback,
        error: duplicateError,
      } = await supabase
        .from('feedback')
        .select(
          'id, feedback, anonymous, teacher_id, class_id',
        )
        .eq('student_code', studentCode)
        .eq('class_id', selectedClass.id)
        .maybeSingle()

      if (duplicateError) {
        console.error(
          'Error checking duplicate feedback:',
          duplicateError,
        )

        setFeedbackError(
          'Unable to verify whether feedback has already been submitted.',
        )

        return
      }

      if (duplicateFeedback) {
        setExistingFeedback(
          duplicateFeedback as ExistingFeedback,
        )

        setFeedbackError(
          'You have already submitted feedback for this class.',
        )

        return
      }

      // ========================================================
      // INSERT FEEDBACK
      // ========================================================

      const {
        data: insertedFeedback,
        error: insertError,
      } = await supabase
        .from('feedback')
        .insert({
          feedback: trimmedFeedback,
          student_code: studentCode,
          anonymous,
          teacher_id: selectedClass.teacher.id,
          class_id: selectedClass.id,
        })
        .select(
          'id, feedback, anonymous, teacher_id, class_id',
        )
        .single()

      if (insertError) {
        console.error(
          'Error submitting feedback:',
          insertError,
        )

        // Unique constraint violation
        if (
          insertError.code === '23505'
        ) {
          await checkExistingFeedback(
            selectedClass,
          )

          setFeedbackError(
            'You have already submitted feedback for this class.',
          )

          return
        }

        setFeedbackError(
          insertError.message ||
            'Unable to submit feedback.',
        )

        return
      }

      // ========================================================
      // SUCCESS
      // ========================================================

      if (insertedFeedback) {
        setExistingFeedback(
          insertedFeedback as ExistingFeedback,
        )
      }

      setFeedbackText('')
      setAnonymous(false)

      setFeedbackMessage(
        'Your feedback has been submitted successfully.',
      )
    } catch (error) {
      console.error(
        'Unexpected feedback error:',
        error,
      )

      setFeedbackError(
        'Something went wrong while submitting your feedback.',
      )
    } finally {
      setFeedbackLoading(false)
    }
  }

  // ============================================================
  // RENDER
  // ============================================================

  return (
    <div className="student-classes-page">

      {/* ======================================================
          PAGE HEADER
         ====================================================== */}

      <div className="student-classes-page-header">
        <h1>My Classes</h1>
      </div>

      {/* ======================================================
          SUMMARY STATS
         ====================================================== */}

      <div className="student-classes-stats-grid">

        <div
          className="student-classes-stat-card"
          style={
            {
              '--accent': '#1447e6',
            } as CSSProperties
          }
        >
          <Calendar
            className="student-classes-stat-watermark"
            size={64}
            strokeWidth={1.5}
          />

          <span className="student-classes-stat-icon">
            <Calendar size={16} />
          </span>

          <p className="student-classes-stat-value">
            {loading ? '—' : classes.length}
          </p>

          <span className="student-classes-stat-label">
            Total Classes
          </span>
        </div>

        <div
          className="student-classes-stat-card"
          style={
            {
              '--accent': '#f5a524',
            } as CSSProperties
          }
        >
          <CalendarClock
            className="student-classes-stat-watermark"
            size={64}
            strokeWidth={1.5}
          />

          <span className="student-classes-stat-icon">
            <CalendarClock size={16} />
          </span>

          <p className="student-classes-stat-value">
            {loading ? '—' : upcomingCount}
          </p>

          <span className="student-classes-stat-label">
            Upcoming / Booked
          </span>
        </div>

        <div
          className="student-classes-stat-card"
          style={
            {
              '--accent': '#1fa971',
            } as CSSProperties
          }
        >
          <CalendarCheck
            className="student-classes-stat-watermark"
            size={64}
            strokeWidth={1.5}
          />

          <span className="student-classes-stat-icon">
            <CalendarCheck size={16} />
          </span>

          <p className="student-classes-stat-value">
            {loading ? '—' : completedCount}
          </p>

          <span className="student-classes-stat-label">
            Completed
          </span>
        </div>

      </div>

      {/* ======================================================
          CLASS LIST
         ====================================================== */}

      <div className="student-classes-list-panel">

        <div className="student-classes-filters">

          <div className="student-classes-filters-left">

            <div className="student-classes-tab-toggle">

              <button
                type="button"
                className={`student-classes-tab ${
                  statusFilter === 'all'
                    ? 'is-active'
                    : ''
                }`}
                onClick={() =>
                  setStatusFilter('all')
                }
              >
                All
              </button>

              <button
                type="button"
                className={`student-classes-tab ${
                  statusFilter === 'booked'
                    ? 'is-active'
                    : ''
                }`}
                onClick={() =>
                  setStatusFilter('booked')
                }
              >
                Upcoming
              </button>

              <button
                type="button"
                className={`student-classes-tab ${
                  statusFilter === 'completed'
                    ? 'is-active'
                    : ''
                }`}
                onClick={() =>
                  setStatusFilter('completed')
                }
              >
                Completed
              </button>

            </div>

          </div>

          <div className="student-classes-date-range">

            <label>
              From

              <input
                type="date"
                value={dateFrom}
                onChange={(e) =>
                  setDateFrom(e.target.value)
                }
              />
            </label>

            <label>
              To

              <input
                type="date"
                value={dateTo}
                onChange={(e) =>
                  setDateTo(e.target.value)
                }
              />
            </label>

            <button
              type="button"
              className="student-classes-range-btn"
              onClick={resetToThisMonth}
            >
              This Month
            </button>

            {(dateFrom || dateTo) && (
              <button
                type="button"
                className="student-classes-range-clear"
                onClick={clearDateRange}
                aria-label="Clear date range"
              >
                <X size={14} />
                Clear
              </button>
            )}

          </div>

        </div>

        {loading ? (
          <p className="student-classes-loading">
            Loading…
          </p>
        ) : filteredClasses.length === 0 ? (
          <div className="student-classes-empty">
            <Calendar size={22} />

            <p>
              No classes match these filters.
            </p>
          </div>
        ) : (
          <div className="student-classes-table-wrap">

            <table className="student-classes-table">

              <thead>
                <tr>
                  <th>Date</th>
                  <th>Time</th>
                  <th>Teacher</th>
                  <th>Subject</th>
                  <th>Status</th>
                </tr>
              </thead>

              <tbody>

                {filteredClasses.map((c) => (

                  <tr
                    key={c.id}
                    className="student-classes-row-clickable"
                    onClick={() =>
                      openClass(c)
                    }
                  >

                    <td>
                      {formatDateLabel(c.date)}
                    </td>

                    <td>
                      {formatTimeLabel(
                        c.start_time,
                      )}
                    </td>

                    <td>
                      <span className="student-classes-row-avatar">
                        <GraduationCap
                          size={13}
                        />
                      </span>

                      {teacherNameFor(c)}
                    </td>

                    <td>
                      {c.class_details
                        ?.subject ?? '—'}
                    </td>

                    <td>

                      <span
                        className={`student-classes-status-badge is-${
                          c.Status ===
                          'Completed'
                            ? 'completed'
                            : 'booked'
                        }`}
                      >
                        {c.Status ===
                        'Completed'
                          ? 'Completed'
                          : 'Upcoming'}
                      </span>

                    </td>

                  </tr>

                ))}

              </tbody>

            </table>

          </div>
        )}

      </div>

      {/* ======================================================
          CLASS DETAIL MODAL
         ====================================================== */}

      {selectedClass && (

        <div
          className="student-classes-modal-overlay"
          onClick={closeClass}
        >

          <div
            className="student-classes-detail-modal"
            onClick={(e) =>
              e.stopPropagation()
            }
          >

            <button
              className="student-classes-modal-close"
              aria-label="Close"
              onClick={closeClass}
            >
              <X size={18} />
            </button>

            {/* =================================================
                CLASS HEADER
               ================================================= */}

            <div className="student-classes-detail-header">

              <h2>
                {formatDateLabel(
                  selectedClass.date,
                )}
              </h2>

              <p className="student-classes-detail-time">
                {formatTimeLabel(
                  selectedClass.start_time,
                )}
              </p>

              <span
                className={`student-classes-status-badge is-${
                  selectedClass.Status ===
                  'Completed'
                    ? 'completed'
                    : 'booked'
                }`}
              >
                {selectedClass.Status ===
                'Completed'
                  ? 'Completed'
                  : 'Upcoming'}
              </span>

            </div>

            {/* =================================================
                CLASS DETAILS
               ================================================= */}

            <div className="student-classes-detail-grid">

              <div className="student-classes-detail-block">

                <span className="student-classes-detail-label">
                  <GraduationCap
                    size={13}
                  />
                  Teacher
                </span>

                <p>
                  {teacherNameFor(
                    selectedClass,
                  )}
                </p>

              </div>

              <div className="student-classes-detail-block">

                <span className="student-classes-detail-label">
                  <BookOpen size={13} />
                  Subject
                </span>

                <p>
                  {selectedClass
                    .class_details
                    ?.subject ?? '—'}
                </p>

              </div>

              <div className="student-classes-detail-block">

                <span className="student-classes-detail-label">
                  <BookOpen size={13} />
                  Book
                </span>

                <p>
                  {selectedClass
                    .class_details
                    ?.book_label ?? '—'}
                </p>

              </div>

              {selectedClass.teacher_rating !=
                null && (

                <div className="student-classes-detail-block">

                  <span className="student-classes-detail-label">
                    <Star size={13} />
                    Rating
                  </span>

                  <p>
                    {selectedClass.teacher_rating.toFixed(
                      1,
                    )}{' '}
                    / 5
                  </p>

                </div>

              )}

            </div>

            {/* =================================================
                CLASS NOTES
               ================================================= */}

            <div className="student-classes-detail-block">

              <span className="student-classes-detail-label">
                <FileText size={13} />
                Class Notes
              </span>

              {selectedClass.class_notes ? (

                <p className="student-classes-detail-notes">
                  {selectedClass.class_notes}
                </p>

              ) : (

                <p className="student-classes-detail-empty">
                  No notes yet.
                </p>

              )}

            </div>

            {/* =================================================
                RECORDING
               ================================================= */}

            <div className="student-classes-detail-block">

              <span className="student-classes-detail-label">
                <Video size={13} />
                Class Recording
              </span>

              {selectedClass.class_recording ? (

                /^https?:\/\//i.test(
                  selectedClass.class_recording,
                ) ? (

                  <a
                    href={
                      selectedClass.class_recording
                    }
                    target="_blank"
                    rel="noreferrer"
                    className="student-classes-detail-link"
                  >
                    Open Recording
                    <ExternalLink
                      size={12}
                    />
                  </a>

                ) : (

                  <p>
                    {
                      selectedClass.class_recording
                    }
                  </p>

                )

              ) : (

                <p className="student-classes-detail-empty">
                  No recording yet.
                </p>

              )}

            </div>

            {/* =================================================
                FEEDBACK
               ================================================= */}

            {identity?.kind !== 'freelance' && (

              <div className="student-classes-feedback-section">

                {selectedClass.Status !==
                'Completed' ? (

                  // ------------------------------------------------
                  // UPCOMING CLASS
                  // ------------------------------------------------

                  <div className="student-classes-feedback-locked">

                    <div className="student-classes-feedback-locked-icon">
                      <MessageSquare
                        size={18}
                      />
                    </div>

                    <div>

                      <strong>
                        Feedback available after class
                      </strong>

                      <p>
                        You can leave feedback
                        once this class has
                        been completed.
                      </p>

                    </div>

                  </div>

                ) : feedbackCheckLoading ? (

                  // ------------------------------------------------
                  // CHECKING EXISTING FEEDBACK
                  // ------------------------------------------------

                  <div className="student-classes-feedback-locked">

                    <div className="student-classes-feedback-locked-icon">
                      <MessageSquare
                        size={18}
                      />
                    </div>

                    <div>

                      <strong>
                        Checking feedback...
                      </strong>

                      <p>
                        Checking whether you
                        have already submitted
                        feedback for this class.
                      </p>

                    </div>

                  </div>

                ) : existingFeedback ? (

                  // ------------------------------------------------
                  // EXISTING FEEDBACK — READ ONLY
                  // ------------------------------------------------

                  <div className="student-classes-feedback-existing">

                    <div className="student-classes-feedback-existing-header">

                      <div className="student-classes-feedback-existing-title">

                        <CheckCircle2
                          size={18}
                        />

                        <strong>
                          Feedback Submitted
                        </strong>

                      </div>

                      <span className="student-classes-feedback-readonly">
                        Read only
                      </span>

                    </div>

                    <div className="student-classes-feedback-existing-box">
                      {existingFeedback.feedback}
                    </div>

                    <div className="student-classes-feedback-existing-footer">

                      {existingFeedback.anonymous
                        ? 'Submitted anonymously'
                        : 'Submitted with your student account'}

                    </div>

                  </div>

                ) : (

                  // ------------------------------------------------
                  // NEW FEEDBACK FORM
                  // ------------------------------------------------

                  <>

                    <div className="student-classes-feedback-header">

                      <span className="student-classes-detail-label">
                        <MessageSquare
                          size={13}
                        />
                        Leave Feedback
                      </span>

                      <p>
                        Tell us about your
                        experience with
                        this teacher.
                      </p>

                    </div>

                    <textarea
                      className="student-classes-feedback-input"
                      value={feedbackText}
                      onChange={(e) =>
                        setFeedbackText(
                          e.target.value,
                        )
                      }
                      placeholder="Write your feedback..."
                      rows={5}
                      disabled={
                        feedbackLoading
                      }
                    />

                    <label className="student-classes-feedback-anonymous">

                      <input
                        type="checkbox"
                        checked={anonymous}
                        onChange={(e) =>
                          setAnonymous(
                            e.target.checked,
                          )
                        }
                        disabled={
                          feedbackLoading
                        }
                      />

                      <span>
                        Submit anonymously
                      </span>

                    </label>

                    {feedbackError && (

                      <div className="student-classes-feedback-error">
                        {feedbackError}
                      </div>

                    )}

                    {feedbackMessage && (

                      <div className="student-classes-feedback-success">

                        <CheckCircle2
                          size={17}
                        />

                        <span>
                          {feedbackMessage}
                        </span>

                      </div>

                    )}

                    <div className="student-classes-feedback-actions">

                      <button
                        type="button"
                        className="student-classes-feedback-cancel"
                        onClick={closeClass}
                        disabled={
                          feedbackLoading
                        }
                      >
                        Close
                      </button>

                      <button
                        type="button"
                        className="student-classes-feedback-submit"
                        onClick={
                          submitFeedback
                        }
                        disabled={
                          feedbackLoading ||
                          !feedbackText.trim()
                        }
                      >
                        {feedbackLoading
                          ? 'Submitting...'
                          : 'Submit Feedback'}
                      </button>

                    </div>

                  </>

                )}

              </div>

            )}

          </div>

        </div>

      )}

    </div>
  )
}

export default Classes