/* Ready Up — Supabase wiring.
 *
 * ─────────────────────────────────────────────────────────────────────────
 *  FILL THIS IN AFTER DEPLOYMENT. Both values below are PUBLISHABLE keys:
 *  they are meant to be visible in the browser. Never paste a `service_role`
 *  key, database password, or SMTP credential into this file — it ships to
 *  every visitor. Find these two under Project Settings → API in Supabase.
 * ───────────────────────────────────────────────────────────────────────── */
window.READYUP_CONFIG = {
  SUPABASE_URL: "https://oysmizffuivkcgiggfbi.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_dYpqdrTDRQ19Je4o85COlw_7INd7AKp",   // publishable — safe in the browser
  SITE_URL: "https://readyup.quest"
};
/* ───────────────────────────────────────────────────────────────────────── */

(function () {
  var cfg = window.READYUP_CONFIG;
  var client = null;

  function configured() {
    return !!(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY && window.supabase);
  }

  function db() {
    if (!client && configured()) {
      client = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
    }
    return client;
  }

  // Until the keys are filled in, every call resolves as a success so the
  // pages stay walkable in preview. Remove nothing — it self-disables the
  // moment real keys are present.
  function demo(data) {
    return Promise.resolve({ ok: true, demo: true, data: data || null });
  }

  function fail(error) {
    var raw = (error && error.message) || "";
    // Always log the real thing; never show it.
    if (raw) { try { console.error("[ReadyUp]", raw); } catch (e) {} }

    // Only these are phrased for users. Anything else is a backend fault and
    // gets a generic line, so Postgres/PostgREST internals never surface.
    if (/already registered/i.test(raw)) return { ok: false, error: "That email already has an account. Try signing in." };
    if (/invalid login credentials/i.test(raw)) return { ok: false, error: "That email and password don't match." };
    if (/token has expired|invalid token|otp.*expired/i.test(raw)) return { ok: false, error: "That code has expired. Send yourself a fresh one." };
    if (/rate limit|too many/i.test(raw)) return { ok: false, error: "Too many attempts. Wait a minute and try again." };
    if (/password.*at least|weak password/i.test(raw)) return { ok: false, error: "That password is too weak. Try a longer one." };
    if (/duplicate key|already exists/i.test(raw)) return { ok: false, error: "That's already taken. Try another." };
    if (/column .* does not exist|schema cache/i.test(raw)) return { ok: false, error: "A profile field isn't set up in the database yet. Run the latest SQL in SUPABASE-SETUP.md." };
    if (/blocked word/i.test(raw)) return { ok: false, error: "That handle isn't allowed. Please choose another." };
    if (/reserved/i.test(raw)) return { ok: false, error: "That handle is reserved. Please choose another." };
    if (/handle_shape|violates check constraint/i.test(raw)) return { ok: false, error: "Handles use lowercase letters, numbers and hyphens only." };
    if (/failed to fetch|networkerror/i.test(raw)) return { ok: false, error: "Can't reach the server. Check your connection and try again." };

    // Storage. These are the ones that actually happen, and each has a fix.
    if (/owned_active_count|members_can_create|violates row-level security policy for table "projects"/i.test(raw)) return { ok: false, error: "You already have three live projects. Ship, pause or archive one first." };
    if (/projects_slug_shape/i.test(raw)) return { ok: false, error: "Project addresses use lowercase letters, numbers and hyphens." };
    if (/projects_slug_key/i.test(raw)) return { ok: false, error: "That project address is taken. Try another." };
    if (/violates row-level security policy/i.test(raw) && /storage|object/i.test(raw)) return { ok: false, error: "You don't have permission to add art to this project." };
    if (/bucket not found/i.test(raw)) return { ok: false, error: "That storage bucket doesn't exist yet. Create 'avatars' and 'cvs' in Supabase → Storage." };
    if (/mime type|not supported/i.test(raw)) return { ok: false, error: "That file type isn't allowed for this bucket. Check the bucket's allowed MIME types in Supabase." };
    if (/payload too large|maximum allowed size|entity too large/i.test(raw)) return { ok: false, error: "That file is larger than the bucket allows. Try a smaller one, or raise the bucket's file size limit." };
    if (/row-level security|violates row-level|not authorized|permission denied/i.test(raw)) return { ok: false, error: "Storage refused the upload: the policies are missing or incomplete. Run the storage SQL in SUPABASE-SETUP.md, including 'own file update'." };
    if (/jwt|not authenticated|invalid claim/i.test(raw)) return { ok: false, error: "Your session expired. Sign in again and retry." };
    return { ok: false, error: "Something went wrong on our end. Try again in a moment." };
  }

  var API = {
    configured: configured,

    /* ---- accounts ---------------------------------------------------- */

    // Sends the verification email automatically (Supabase does this on signUp).
    signUp: function (email, password) {
      if (!configured()) return demo();
      return db().auth.signUp({
        email: email,
        password: password,
        options: { emailRedirectTo: cfg.SITE_URL + "/join.html?screen=verified" }
      }).then(function (r) {
        return r.error ? fail(r.error) : { ok: true, data: r.data };
      });
    },

    signIn: function (email, password) {
      if (!configured()) return demo();
      return db().auth.signInWithPassword({ email: email, password: password })
        .then(function (r) { return r.error ? fail(r.error) : { ok: true, data: r.data }; });
    },

    signOut: function () {
      if (!configured()) return demo();
      return db().auth.signOut().then(function () { return { ok: true }; });
    },

    // The six-digit code from the email. Requires {{ .Token }} in the
    // Supabase "Confirm signup" template — see SUPABASE-SETUP.md.
    verifyCode: function (email, code) {
      if (!configured()) return code === "402913" ? demo() : Promise.resolve({ ok: false, error: "That code doesn't match the one we sent." });
      return db().auth.verifyOtp({ email: email, token: code, type: "signup" })
        .then(function (r) { return r.error ? fail(r.error) : { ok: true, data: r.data }; });
    },

    resendVerification: function (email) {
      if (!configured()) return demo();
      return db().auth.resend({ type: "signup", email: email })
        .then(function (r) { return r.error ? fail(r.error) : { ok: true }; });
    },

    sendPasswordReset: function (email) {
      if (!configured()) return demo();
      return db().auth.resetPasswordForEmail(email, { redirectTo: cfg.SITE_URL + "/join.html?screen=reset" })
        .then(function (r) { return r.error ? fail(r.error) : { ok: true }; });
    },

    // Runs on the page the reset link lands on; the SDK already holds the
    // recovery session by then.
    setNewPassword: function (password) {
      if (!configured()) return demo();
      // the recovery link puts a short-lived session in place; without one
      // there is nothing to update
      return db().auth.getSession().then(function (s) {
        if (!s.data || !s.data.session) {
          return { ok: false, error: "This reset link has expired or was already used. Ask for a fresh one." };
        }
        return db().auth.updateUser({ password: password })
          .then(function (r) { return r.error ? fail(r.error) : { ok: true }; });
      });
    },

    // true once the recovery link's session is in place
    hasRecoverySession: function () {
      if (!configured()) return Promise.resolve(true);
      return db().auth.getSession().then(function (s) { return !!(s.data && s.data.session); });
    },

    getSession: function () {
      if (!configured()) return Promise.resolve({ ok: true, demo: true, data: null });
      return db().auth.getSession().then(function (r) {
        return { ok: true, data: (r.data && r.data.session) || null };
      });
    },

    /* ---- profiles ---------------------------------------------------- */

    // Case-insensitive. The DB also holds a unique index, which is what
    // actually enforces it — this is only for the live message as you type.
    handleAvailable: function (handle) {
      if (!configured()) return demo({ available: true });
      // RPC, not a table read: RLS hides hidden/members rows, so a direct
      // select would report a taken handle as free. See SUPABASE-SETUP.md §3.
      return db().rpc("handle_available", { candidate: handle })
        .then(function (r) {
          if (r.error) return fail(r.error);
          return { ok: true, data: { available: r.data === true } };
        });
    },

    // Public read by handle. RLS decides what comes back: a hidden profile,
    // or one awaiting deletion, returns nothing even though the row exists.
    getPublicProfile: function (handle) {
      if (!configured()) return demo(null);
      return db().from("profiles").select("*").ilike("handle", handle).maybeSingle()
        .then(function (r) {
          if (r.error) return fail(r.error);
          return { ok: true, data: r.data || null };
        });
    },

    // A URL the owner can always load, whether or not the bucket is public.
    // Falls back to the public URL if signing is refused.
    avatarSignedUrl: function (path) {
      var self = this;
      if (!path || !configured()) return Promise.resolve("");
      return db().storage.from(this.bucketFor(path)).createSignedUrl(path, 3600)
        .then(function (r) {
          var u = r && r.data && r.data.signedUrl;
          return u || self.avatarUrl(path);
        })
        .catch(function () { return self.avatarUrl(path); });
    },

    // Which bucket a stored path lives in. New uploads carry a "u/" or "p/"
    // prefix and live in `media`; anything older is from `avatars`, so old
    // rows keep resolving with no migration.
    bucketFor: function (path) {
      return /^[up]\//.test(path || "") ? "media" : "avatars";
    },

    // Public URL for a stored image. Cheap, synchronous, no signing needed.
    // Named avatarUrl for history; it resolves any public image path.
    avatarUrl: function (path) {
      if (!path || !configured()) return "";
      var r = db().storage.from(this.bucketFor(path)).getPublicUrl(path);
      return (r && r.data && r.data.publicUrl) || "";
    },

    // CVs live in a private bucket, so a link has to be signed and expires.
    cvUrl: function (path) {
      if (!path || !configured()) return Promise.resolve("");
      return db().storage.from("cvs").createSignedUrl(path, 3600)
        .then(function (r) { return (r.data && r.data.signedUrl) || ""; })
        .catch(function () { return ""; });
    },

    loadProfile: function () {
      if (!configured()) return demo(null);
      return db().auth.getUser().then(function (u) {
        var id = u.data && u.data.user && u.data.user.id;
        if (!id) return { ok: false, error: "Not signed in." };
        return db().from("profiles").select("*").eq("id", id).single()
          .then(function (r) { return r.error ? fail(r.error) : { ok: true, data: r.data }; });
      });
    },

    saveProfile: function (fields) {
      if (!configured()) return demo();
      return db().auth.getUser().then(function (u) {
        var id = u.data && u.data.user && u.data.user.id;
        if (!id) return { ok: false, error: "Not signed in." };
        var row = Object.assign({ id: id, updated_at: new Date().toISOString() }, fields);
        return db().from("profiles").upsert(row).then(function (r) {
          if (!r.error) return { ok: true };
          // A column the page knows about but the database doesn't yet: drop it
          // and save the rest, so a pending migration can't cost someone their edits.
          var miss = String(r.error.message || "").match(/column "?([a-z_]+)"?.*does not exist|'([a-z_]+)' column/i);
          var key = miss && (miss[1] || miss[2]);
          if (key && Object.prototype.hasOwnProperty.call(row, key)) {
            var trimmed = Object.assign({}, row);
            delete trimmed[key];
            return db().from("profiles").upsert(trimmed).then(function (r2) {
              if (r2.error) return fail(r2.error);
              return { ok: true, warning: "Saved, but “" + key.replace(/_/g, " ") + "” couldn't be stored yet. Run the latest SQL in SUPABASE-SETUP.md." };
            });
          }
          return fail(r.error);
        });
      });
    },

    /* ---- files ------------------------------------------------------- */

    // bucket: "media" (public images), "cvs" (private), or "avatars" (legacy).
    // For "media", pass opts: {scope:"user"} or {scope:"project", id:<uuid>} —
    // the scope decides the folder, and the folder decides who may write there.
    // See MEDIA-BUCKET-SQL.md.
    uploadFile: function (bucket, file, opts) {
      if (!configured()) return demo({ path: file && file.name });
      return db().auth.getUser().then(function (u) {
        var id = u.data && u.data.user && u.data.user.id;
        if (!id) return { ok: false, error: "Not signed in." };
        var safe = Date.now() + "-" + file.name.replace(/[^a-zA-Z0-9.\-_]/g, "_");
        var folder;
        if (bucket === "media") {
          var o = opts || {};
          if (o.scope === "project") {
            if (!o.id) return { ok: false, error: "That project isn't saved yet." };
            folder = "p/" + o.id;
          } else {
            folder = "u/" + id;
          }
        } else {
          folder = id; // cvs, and the legacy avatars layout
        }
        var path = folder + "/" + safe;
        return db().storage.from(bucket).upload(path, file, { upsert: false, contentType: file.type || undefined })
          .then(function (r) { return r.error ? fail(r.error) : { ok: true, data: { path: path } }; });
      });
    },

    // bucket is optional: omit it and the path decides.
    removeFile: function (bucket, path) {
      if (!configured()) return demo();
      if (arguments.length === 1) { path = bucket; bucket = this.bucketFor(path); }
      return db().storage.from(bucket).remove([path])
        .then(function (r) { return r.error ? fail(r.error) : { ok: true }; });
    },

    /* ---- projects ----------------------------------------------------- */

    // Someone's Ready Up credits, for their public profile. RLS returns only
    // active and past rows, so a pending invite never shows up as a credit.
    publicCredits: function (profileId) {
      if (!configured()) return demo([]);
      return db().from("project_members")
        .select("role_label,is_owner,state,joined_at,left_at,projects(name,slug,pitch,status)")
        .eq("profile_id", profileId)
        .in("state", ["active", "past"])
        .then(function (r) {
          if (r.error) return fail(r.error);
          var rows = (r.data || []).filter(function (m) { return m.projects; });
          return { ok: true, data: rows };
        });
    },


    // Everything I'm on, in any state, with my membership row attached.
    myProjects: function () {
      if (!configured()) return demo([]);
      return db().auth.getUser().then(function (u) {
        var uid = u.data && u.data.user && u.data.user.id;
        if (!uid) return { ok: true, data: [] };
        return db().from("project_members")
          .select("role_label,is_owner,state,can_add_resources,joined_at,projects(*)")
          .eq("profile_id", uid)
          .then(function (r) {
            if (r.error) return fail(r.error);
            var rows = (r.data || []).filter(function (m) { return m.projects; });
            return { ok: true, data: rows };
          });
      });
    },

    createProject: function (fields) {
      if (!configured()) return demo({ slug: fields.slug });
      return db().auth.getUser().then(function (u) {
        var uid = u.data && u.data.user && u.data.user.id;
        if (!uid) return { ok: false, error: "Not signed in." };
        return db().from("projects").insert({
          slug: fields.slug, name: fields.name,
          pitch: fields.pitch || null, status: fields.status || "forming",
          created_by: uid
        }).select().maybeSingle()
          .then(function (r) { return r.error ? fail(r.error) : { ok: true, data: r.data }; });
      });
    },

    updateProject: function (id, fields) {
      if (!configured()) return demo();
      return db().from("projects").update(fields).eq("id", id)
        .then(function (r) { return r.error ? fail(r.error) : { ok: true }; });
    },

    deleteProject: function (id) {
      if (!configured()) return demo();
      return db().from("projects").delete().eq("id", id)
        .then(function (r) { return r.error ? fail(r.error) : { ok: true }; });
    },

    // Public: the project and its team. RLS hides pending invites from
    // everyone but the invitee and the owner.
    getProject: function (slug) {
      if (!configured()) return demo(null);
      return db().from("projects")
        .select("*,project_members(profile_id,role_label,is_owner,state,joined_at,left_at,can_add_resources,profiles(handle,display_name,discipline,avatar_path))")
        .ilike("slug", slug).maybeSingle()
        .then(function (r) {
          if (r.error) return fail(r.error);
          return { ok: true, data: r.data || null };
        });
    },

    inviteByHandle: function (projectId, handle, role) {
      if (!configured()) return demo({ result: "ok" });
      return db().rpc("invite_by_handle", { p_project: projectId, p_handle: handle, p_role: role || null })
        .then(function (r) {
          if (r.error) return fail(r.error);
          var code = r.data;
          if (code === "ok") return { ok: true };
          if (code === "no_such_member") return { ok: false, error: "No member with that profile address." };
          if (code === "already_invited") return { ok: false, error: "They're already on this project." };
          if (code === "not_owner") return { ok: false, error: "Only the project's owner can invite people." };
          return { ok: false, error: "Couldn't send that invite." };
        });
    },

    // An invite only becomes a credit when the invitee accepts.
    respondToInvite: function (projectId, accept) {
      if (!configured()) return demo();
      return db().auth.getUser().then(function (u) {
        var uid = u.data && u.data.user && u.data.user.id;
        if (!uid) return { ok: false, error: "Not signed in." };
        var patch = accept
          ? { state: "active", joined_at: new Date().toISOString() }
          : { state: "past", left_at: new Date().toISOString() };
        return db().from("project_members").update(patch)
          .eq("project_id", projectId).eq("profile_id", uid)
          .then(function (r) { return r.error ? fail(r.error) : { ok: true }; });
      });
    },

    leaveProject: function (projectId) {
      if (!configured()) return demo();
      return db().auth.getUser().then(function (u) {
        var uid = u.data && u.data.user && u.data.user.id;
        if (!uid) return { ok: false, error: "Not signed in." };
        return db().from("project_members")
          .update({ state: "past", left_at: new Date().toISOString() })
          .eq("project_id", projectId).eq("profile_id", uid)
          .then(function (r) { return r.error ? fail(r.error) : { ok: true }; });
      });
    },

    setMember: function (projectId, profileId, fields) {
      if (!configured()) return demo();
      return db().from("project_members").update(fields)
        .eq("project_id", projectId).eq("profile_id", profileId)
        .then(function (r) { return r.error ? fail(r.error) : { ok: true }; });
    },

    // Team-only. A non-member gets an empty list rather than an error.
    listResources: function (projectId) {
      if (!configured()) return demo([]);
      return db().from("project_resources")
        .select("*").eq("project_id", projectId).order("created_at", { ascending: true })
        .then(function (r) {
          if (r.error) return fail(r.error);
          return { ok: true, data: r.data || [] };
        });
    },

    addResource: function (projectId, label, url) {
      if (!configured()) return demo();
      return db().auth.getUser().then(function (u) {
        var uid = u.data && u.data.user && u.data.user.id;
        if (!uid) return { ok: false, error: "Not signed in." };
        return db().from("project_resources")
          .insert({ project_id: projectId, label: label, url: url, added_by: uid })
          .then(function (r) { return r.error ? fail(r.error) : { ok: true }; });
      });
    },

    removeResource: function (id) {
      if (!configured()) return demo();
      return db().from("project_resources").delete().eq("id", id)
        .then(function (r) { return r.error ? fail(r.error) : { ok: true }; });
    },

    // Is this slug free? Used before creating, so the error is inline.
    slugFree: function (slug) {
      if (!configured()) return demo({ free: true });
      return db().from("projects").select("id").ilike("slug", slug).maybeSingle()
        .then(function (r) { return { ok: true, data: { free: !r.data } }; });
    },

    /* ---- danger ------------------------------------------------------ */

    // Deletion is scheduled, not immediate: the row is marked and a nightly
    // job does the irreversible part 24h later. Marking is an ordinary update
    // on your own row, so no privileged key is involved.
    requestDeletion: function (password) {
      if (!configured()) return demo({ scheduledFor: new Date(Date.now() + 864e5).toISOString() });
      return db().auth.getUser().then(function (u) {
        var user = u.data && u.data.user;
        if (!user) return { ok: false, error: "Not signed in." };
        // re-authenticate, so a borrowed open tab can't schedule this
        return db().auth.signInWithPassword({ email: user.email, password: password })
          .then(function (check) {
            if (check.error) return { ok: false, error: "That isn't your password." };
            var when = new Date(Date.now() + 864e5).toISOString();
            return db().from("profiles")
              .update({ deletion_scheduled_at: when })
              .eq("id", user.id)
              .then(function (r) {
                return r.error ? fail(r.error) : { ok: true, data: { scheduledFor: when } };
              });
          });
      });
    },

    cancelDeletion: function () {
      if (!configured()) return demo();
      return db().auth.getUser().then(function (u) {
        var id = u.data && u.data.user && u.data.user.id;
        if (!id) return { ok: false, error: "Not signed in." };
        return db().from("profiles")
          .update({ deletion_scheduled_at: null })
          .eq("id", id)
          .then(function (r) { return r.error ? fail(r.error) : { ok: true }; });
      });
    }
  };

  window.ReadyUpAPI = API;
})();
