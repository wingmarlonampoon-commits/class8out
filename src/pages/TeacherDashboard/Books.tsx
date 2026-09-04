import { useEffect, useState, type FormEvent } from 'react'
import { BookOpen, ExternalLink, Link2, X } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { useTeacherIdentity } from '../../hooks/useTeacherIdentity'
import { ESL_SUBJECTS } from '../../data/eslSubjects'
import './Books.css'

type BookRow = {
  id: string
  title: string
  description: string | null
  subject: string
  category: string
  book_url: string
  PublicAvailability?: boolean
  created_at: string
  company_code?: string
  teacher_id?: string
  ownerName?: string
  isOwn?: boolean
}

type OwnerRow = {
  company_code: string
  company_name: string
}

type FreelanceOwnerRow = {
  teacher_id: string
  teacher_name: string
}

type Message = {
  type: 'success' | 'error'
  text: string
}

const CATEGORIES = [
  'Textbook',
  'Workbook',
  'Reference',
  'Worksheet',
  'Other',
]

const FREELANCE_BOOK_COLUMNS =
  'id, title, description, subject, category, book_url, created_at, PublicAvailability, teacher_id'

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })

function Books() {
  const { identity } = useTeacherIdentity()
  const isFreelance = identity?.kind === 'freelance'

  const [books, setBooks] = useState<BookRow[]>([])
  const [listLoading, setListLoading] = useState(true)
  const [reloadToken, setReloadToken] = useState(0)

  const [showModal, setShowModal] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [subject, setSubject] = useState(ESL_SUBJECTS[0])
  const [customSubject, setCustomSubject] = useState('')
  const [category, setCategory] = useState(CATEGORIES[0])
  const [customCategory, setCustomCategory] = useState('')
  const [bookUrl, setBookUrl] = useState('')
  const [isPublic, setIsPublic] = useState(true)

  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<Message | null>(null)

  useEffect(() => {
    if (!identity) return

    setListLoading(true)

    const bookColumns =
      'id, title, description, subject, category, book_url, PublicAvailability, created_at, company_code'

    // Foreign companies' names are resolved via a narrow RPC
    // (public_book_owner_names) rather than a broad company_registration
    // grant, which would over-expose that company's email/phone/settings.
    async function resolveForeignOwnerNames(
      codes: string[],
    ): Promise<Map<string, string>> {
      if (codes.length === 0) {
        return new Map<string, string>()
      }

      const { data } = await supabase.rpc(
        'public_book_owner_names',
        {
          p_codes: codes,
        },
      )

      const ownerRows: OwnerRow[] = (data ?? []) as OwnerRow[]

      return new Map<string, string>(
        ownerRows.map(
          (o): [string, string] => [
            o.company_code,
            o.company_name,
          ],
        ),
      )
    }

    // Same pattern as resolveForeignOwnerNames, but for freelance teachers
    // who've made a book public — resolves only id -> display name via a
    // narrow RPC, never the full teacher record.
    async function resolveFreelanceOwnerNames(
      teacherIds: string[],
    ): Promise<Map<string, string>> {
      if (teacherIds.length === 0) {
        return new Map<string, string>()
      }

      const { data } = await supabase.rpc(
        'public_freelance_book_owner_names',
        {
          p_teacher_ids: teacherIds,
        },
      )

      const ownerRows: FreelanceOwnerRow[] =
        (data ?? []) as FreelanceOwnerRow[]

      return new Map<string, string>(
        ownerRows.map(
          (o): [string, string] => [
            o.teacher_id,
            o.teacher_name,
          ],
        ),
      )
    }

    if (identity.kind === 'freelance') {
      // Freelance teachers own a private-by-default freelance_books table,
      // but can mark individual books PublicAvailability=true, in which
      // case other freelance teachers and company teachers should see them
      // too — same as a company marking a book public.
      Promise.all([
        supabase
          .from('freelance_books')
          .select(FREELANCE_BOOK_COLUMNS)
          .eq('teacher_id', identity.teacherId),

        supabase
          .from('books')
          .select(bookColumns)
          .eq('PublicAvailability', true),

        supabase
          .from('freelance_books')
          .select(FREELANCE_BOOK_COLUMNS)
          .eq('PublicAvailability', true)
          .neq('teacher_id', identity.teacherId),
      ]).then(async ([own, pubCompanyBooks, pubFreelanceBooks]) => {
        const ownRows: BookRow[] = (
          (own.data as BookRow[]) ?? []
        ).map((b) => ({
          ...b,
          isOwn: true,
          ownerName: 'You',
        }))

        const publicCompanyRows: BookRow[] =
          (pubCompanyBooks.data as BookRow[]) ?? []

        const publicFreelanceRows: BookRow[] =
          (pubFreelanceBooks.data as BookRow[]) ?? []

        const publicCodes = [
          ...new Set(
            publicCompanyRows
              .map((b) => b.company_code)
              .filter(
                (code): code is string =>
                  Boolean(code),
              ),
          ),
        ]

        const publicTeacherIds = [
          ...new Set(
            publicFreelanceRows
              .map((b) => b.teacher_id)
              .filter(
                (id): id is string => Boolean(id),
              ),
          ),
        ]

        const [nameMap, freelanceNameMap] =
          await Promise.all([
            resolveForeignOwnerNames(publicCodes),
            resolveFreelanceOwnerNames(publicTeacherIds),
          ])

        const resolvedPublicCompanyRows: BookRow[] =
          publicCompanyRows.map((b) => ({
            ...b,
            ownerName:
              nameMap.get(b.company_code ?? '') ??
              b.company_code,
          }))

        const resolvedPublicFreelanceRows: BookRow[] =
          publicFreelanceRows.map((b) => ({
            ...b,
            isOwn: false,
            ownerName:
              freelanceNameMap.get(b.teacher_id ?? '') ??
              'Another teacher',
          }))

        const merged: BookRow[] = [
          ...ownRows,
          ...resolvedPublicCompanyRows,
          ...resolvedPublicFreelanceRows,
        ]

        merged.sort((a, b) =>
          b.created_at.localeCompare(a.created_at),
        )

        setBooks(merged)
        setListLoading(false)
      })

      return
    }

    const companyCode = identity.companyCode
    const companyName = identity.companyName

    // Own company's full catalog, other companies' public books, and any
    // freelance teacher's public books.
    Promise.all([
      supabase
        .from('books')
        .select(bookColumns)
        .eq('company_code', companyCode),

      supabase
        .from('books')
        .select(bookColumns)
        .eq('PublicAvailability', true)
        .neq('company_code', companyCode),

      supabase
        .from('freelance_books')
        .select(FREELANCE_BOOK_COLUMNS)
        .eq('PublicAvailability', true),
    ]).then(async ([own, pub, pubFreelanceBooks]) => {
      const merged: BookRow[] = [
        ...((own.data as BookRow[]) ?? []),
        ...((pub.data as BookRow[]) ?? []),
      ]

      merged.sort((a, b) =>
        b.created_at.localeCompare(a.created_at),
      )

      const foreignCodes = [
        ...new Set(
          merged
            .map((b) => b.company_code)
            .filter(
              (code): code is string =>
                Boolean(code) && code !== companyCode,
            ),
        ),
      ]

      const publicFreelanceRows: BookRow[] =
        (pubFreelanceBooks.data as BookRow[]) ?? []

      const teacherIds = [
        ...new Set(
          publicFreelanceRows
            .map((b) => b.teacher_id)
            .filter(
              (id): id is string => Boolean(id),
            ),
        ),
      ]

      const [foreignNames, freelanceNameMap] =
        await Promise.all([
          resolveForeignOwnerNames(foreignCodes),
          resolveFreelanceOwnerNames(teacherIds),
        ])

      const nameMap = new Map<string, string>([
        [companyCode, companyName],
        ...foreignNames,
      ])

      const mergedWithOwners: BookRow[] =
        merged.map((b) => ({
          ...b,
          isOwn: b.company_code === companyCode,
          ownerName:
            nameMap.get(b.company_code ?? '') ??
            b.company_code,
        }))

      const resolvedFreelanceRows: BookRow[] =
        publicFreelanceRows.map((b) => ({
          ...b,
          isOwn: false,
          ownerName:
            freelanceNameMap.get(b.teacher_id ?? '') ??
            'Independent teacher',
        }))

      const all = [
        ...mergedWithOwners,
        ...resolvedFreelanceRows,
      ]

      all.sort((a, b) =>
        b.created_at.localeCompare(a.created_at),
      )

      setBooks(all)
      setListLoading(false)
    })
  }, [identity, reloadToken])

  const resetForm = () => {
    setTitle('')
    setDescription('')
    setSubject(ESL_SUBJECTS[0])
    setCustomSubject('')
    setCategory(CATEGORIES[0])
    setCustomCategory('')
    setBookUrl('')
    setIsPublic(true)
  }

  const openModal = () => {
    resetForm()
    setMessage(null)
    setShowModal(true)
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setMessage(null)

    if (!identity || identity.kind !== 'freelance') {
      return
    }

    const finalSubject =
      subject === 'Other'
        ? customSubject.trim()
        : subject

    const finalCategory =
      category === 'Other'
        ? customCategory.trim()
        : category

    if (subject === 'Other' && !finalSubject) {
      setMessage({
        type: 'error',
        text: 'Please enter a subject.',
      })
      return
    }

    if (category === 'Other' && !finalCategory) {
      setMessage({
        type: 'error',
        text: 'Please enter a category.',
      })
      return
    }

    setLoading(true)

    const { error: insertError } =
      await supabase
        .from('freelance_books')
        .insert({
          teacher_id: identity.teacherId,
          title: title.trim(),
          description:
            description.trim() || null,
          subject: finalSubject,
          category: finalCategory,
          book_url: bookUrl,
          PublicAvailability: isPublic,
        })

    setLoading(false)

    if (insertError) {
      setMessage({
        type: 'error',
        text: 'Could not save the book. Please try again.',
      })
      return
    }

    setMessage({
      type: 'success',
      text: 'Book added.',
    })

    resetForm()
    setReloadToken((n) => n + 1)
  }

  return (
    <div className="teacher-books-page">
      <div className="teacher-books-page-header">
        <h1>{isFreelance ? 'My Books' : 'Books'}</h1>

        {isFreelance && (
          <button
            className="btn btn-primary"
            onClick={openModal}
          >
            <Link2 size={16} /> Add Book
          </button>
        )}
      </div>

      {!isFreelance && identity && (
        <p className="teacher-books-field-help">
          Your company's book catalog, plus public books shared
          by other companies and independent teachers — reach
          out to your admin to add or change one.
        </p>
      )}

      <div className="teacher-books-list-panel">
        {listLoading ? (
          <p className="teacher-books-loading">
            Loading…
          </p>
        ) : books.length === 0 ? (
          <div className="teacher-books-empty">
            <BookOpen size={22} />
            <p>
              {isFreelance
                ? 'No books yet. Add one to get started.'
                : 'No books in your catalog yet.'}
            </p>
          </div>
        ) : (
          <div className="teacher-books-table-wrap">
            <table className="teacher-books-table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Owner</th>
                  <th>Subject</th>
                  <th>Category</th>
                  <th>Visibility</th>
                  <th>Added</th>
                  <th></th>
                </tr>
              </thead>

              <tbody>
                {books.map((b) => (
                  <tr key={b.id}>
                    <td>
                      <span className="teacher-books-row-avatar">
                        <BookOpen size={14} />
                      </span>

                      {b.title || '—'}
                    </td>

                    <td>
                      {b.ownerName}

                      {isFreelance && b.isOwn && (
                        <span className="teacher-books-owner-you">
                          {' '}
                          (You)
                        </span>
                      )}

                      {!isFreelance && b.isOwn && (
                        <span className="teacher-books-owner-you">
                          {' '}
                          (You)
                        </span>
                      )}
                    </td>

                    <td>{b.subject || '—'}</td>

                    <td>
                      <span className="teacher-books-category-badge">
                        {b.category || '—'}
                      </span>
                    </td>

                    <td>
                      <span
                        className={`teacher-books-visibility-badge ${
                          b.PublicAvailability
                            ? 'is-public'
                            : 'is-private'
                        }`}
                      >
                        {b.PublicAvailability
                          ? 'Public'
                          : 'Private'}
                      </span>
                    </td>

                    <td>
                      {formatDate(b.created_at)}
                    </td>

                    <td>
                      <a
                        href={b.book_url}
                        target="_blank"
                        rel="noreferrer"
                        className="teacher-books-open-link"
                      >
                        Open{' '}
                        <ExternalLink size={13} />
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && (
        <div
          className="teacher-books-modal-overlay"
          onClick={() => setShowModal(false)}
        >
          <div
            className="teacher-books-modal"
            onClick={(e) =>
              e.stopPropagation()
            }
          >
            <button
              className="teacher-books-modal-close"
              aria-label="Close"
              onClick={() =>
                setShowModal(false)
              }
            >
              <X size={18} />
            </button>

            <div className="teacher-books-modal-scroll">
              <div className="teacher-books-panel">
                <div className="teacher-books-panel-header">
                  <span className="teacher-books-panel-icon">
                    <Link2 size={18} />
                  </span>

                  <div>
                    <h2>Add Book</h2>
                    <p className="teacher-books-panel-subtitle">
                      Link a book or resource for your students.
                    </p>
                  </div>
                </div>

                <form
                  className="teacher-books-form"
                  onSubmit={handleSubmit}
                  autoComplete="off"
                >
                  <label>
                    Book Title

                    <input
                      type="text"
                      value={title}
                      onChange={(e) =>
                        setTitle(e.target.value)
                      }
                      placeholder="e.g. Grammar in Use"
                      autoComplete="off"
                      required
                    />
                  </label>

                  <label>
                    Description

                    <textarea
                      className="teacher-books-textarea"
                      value={description}
                      onChange={(e) =>
                        setDescription(
                          e.target.value,
                        )
                      }
                      rows={3}
                      placeholder="What this book covers, who it's for…"
                    />
                  </label>

                  <label>
                    Subject

                    <select
                      value={subject}
                      onChange={(e) =>
                        setSubject(
                          e.target.value,
                        )
                      }
                    >
                      {ESL_SUBJECTS.map((s) => (
                        <option
                          key={s}
                          value={s}
                        >
                          {s}
                        </option>
                      ))}
                    </select>
                  </label>

                  {subject === 'Other' && (
                    <label>
                      Custom Subject

                      <input
                        type="text"
                        value={customSubject}
                        onChange={(e) =>
                          setCustomSubject(
                            e.target.value,
                          )
                        }
                        placeholder="Enter a subject"
                        autoComplete="off"
                        required
                      />
                    </label>
                  )}

                  <label>
                    Category

                    <select
                      value={category}
                      onChange={(e) =>
                        setCategory(
                          e.target.value,
                        )
                      }
                    >
                      {CATEGORIES.map((c) => (
                        <option
                          key={c}
                          value={c}
                        >
                          {c}
                        </option>
                      ))}
                    </select>
                  </label>

                  {category === 'Other' && (
                    <label>
                      Custom Category

                      <input
                        type="text"
                        value={customCategory}
                        onChange={(e) =>
                          setCustomCategory(
                            e.target.value,
                          )
                        }
                        placeholder="Enter a category"
                        autoComplete="off"
                        required
                      />
                    </label>
                  )}

                  <label>
                    Book URL

                    <input
                      type="url"
                      value={bookUrl}
                      onChange={(e) =>
                        setBookUrl(
                          e.target.value,
                        )
                      }
                      placeholder="https://…"
                      autoComplete="off"
                      required
                    />
                  </label>

                  <div className="teacher-books-visibility-group">
                    <span className="teacher-books-field-label">
                      Visibility
                    </span>

                    <div className="teacher-books-visibility-toggle">
                      <label
                        className={`teacher-books-visibility-pill ${
                          isPublic ? 'is-active' : ''
                        }`}
                      >
                        <input
                          type="radio"
                          checked={isPublic}
                          onChange={() =>
                            setIsPublic(true)
                          }
                        />
                        Public
                      </label>

                      <label
                        className={`teacher-books-visibility-pill ${
                          !isPublic ? 'is-active' : ''
                        }`}
                      >
                        <input
                          type="radio"
                          checked={!isPublic}
                          onChange={() =>
                            setIsPublic(false)
                          }
                        />
                        Private
                      </label>
                    </div>

                    <p className="teacher-books-visibility-help">
                      {isPublic
                        ? 'Any Class8out teacher — at any company, or freelance — can view this book and use it in their lessons.'
                        : 'Only you can see this book.'}
                    </p>
                  </div>

                  {message && (
                    <p
                      className={`teacher-books-message is-${message.type}`}
                    >
                      {message.text}
                    </p>
                  )}

                  <button
                    className="btn btn-primary"
                    type="submit"
                    disabled={loading}
                  >
                    {loading
                      ? 'Adding…'
                      : 'Add Book'}
                  </button>
                </form>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Books