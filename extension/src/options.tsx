import { Wordmark } from "~ui/Logo"
import { ProfileModal } from "~ui/modal/ProfileModal"
import { ResumeCard } from "~ui/ResumeCard"
import { useProfile } from "~ui/useProfile"

import "~ui/styles.css"

/**
 * The full-page profile editor.
 *
 * The same ProfileModal renders here inline and inside the drawer as an
 * overlay, so there is exactly one implementation of the profile form and no
 * chance of the two drifting apart.
 */
function OptionsPage() {
  const { profile, loading, dirty, saving, resumeError, update, save, revert, uploadResume, removeResume } =
    useProfile()

  return (
    <div className="ditto-root ditto-page">
      <div className="ditto-page-inner">
        <header>
          <Wordmark size={34} />
        </header>

        {loading || !profile ? (
          <div className="ditto-empty">Loading your profile...</div>
        ) : (
          <>
            <ResumeCard
              resume={profile.resume}
              error={resumeError}
              onUpload={uploadResume}
              onRemove={removeResume}
            />

            <ProfileModal
              inline
              profile={profile}
              update={update}
              dirty={dirty}
              saving={saving}
              onSave={save}
              onRevert={revert}
            />

            <p className="ditto-subtle" style={{ textAlign: "center" }}>
              Everything here is stored on this device only. Ditto has no account and no server,
              which is why there is no limit on how many applications you can fill.
            </p>
          </>
        )}
      </div>
    </div>
  )
}

export default OptionsPage
