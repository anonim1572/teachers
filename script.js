let supabase = null;

const app = {
  teachers: [],
  currentTeacherId: null,
  currentTab: "natural",
  currentMediaIndex: null,
  isAdmin: false,
  supabase: null,
  isLoggedIn: false,
  currentUser: null,
  searchQuery: "",

  async init() {
    if (
      typeof window.SUPABASE_CONFIG !== "undefined" &&
      typeof window.supabase !== "undefined"
    ) {
      const { createClient } = window.supabase;
      supabase = createClient(
        window.SUPABASE_CONFIG.url,
        window.SUPABASE_CONFIG.anonKey
      );
      this.supabase = supabase;
    }
    const sessionToken = sessionStorage.getItem("userSession");
    const userId = sessionStorage.getItem("userId");

    if (sessionToken && userId) {
      const isValid = await this.verifySession(userId, sessionToken);
      if (isValid) {
        this.isLoggedIn = true;
        this.isAdmin = true;
        this.hideLoginScreen();
        await this.loadApp();
      } else {
        this.showLoginScreen();
      }
    } else {
      this.showLoginScreen();
    }
  },

  async loadApp() {
    this.isAdmin =
      this.isLoggedIn || localStorage.getItem("isAdmin") === "true";
    const deleteBtn = document.querySelector(".delete-teacher-btn");
    const editBtn = document.querySelector(".edit-teacher-btn");
    if (deleteBtn) {
      deleteBtn.style.display = "none";
    }
    if (editBtn) {
      editBtn.style.display = "none";
    }

    this.updateAdminUI();
    if (this.supabase) {
      await this.loadTeachersFromSupabase();
    } else {
      this.loadFromLocalStorage();
    }

    this.renderTeachersGrid();
    this.renderRecentlyAdded();
    this.setupEventListeners();
  },
  showLoginScreen() {
    document.getElementById("login-screen").classList.remove("hidden");
  },

  hideLoginScreen() {
    document.getElementById("login-screen").classList.add("hidden");
  },

  async handleMainLogin(event) {
    event.preventDefault();

    const username = document.getElementById("login-username").value.trim();
    const password = document.getElementById("login-password").value;
    const errorDiv = document.getElementById("login-error");

    errorDiv.classList.remove("show");

    if (!username || !password) {
      errorDiv.textContent = "Wypełnij wszystkie pola";
      errorDiv.classList.add("show");
      return;
    }

    try {
      this.showLoading();
      if (this.supabase) {
        const { data: users, error } = await this.supabase
          .from("users")
          .select("*")
          .eq("username", username)
          .eq("is_active", true)
          .limit(1);

        if (error) throw error;

        if (users && users.length > 0) {
          const user = users[0];
          let isPasswordValid = false;
          if (typeof bcrypt !== "undefined") {
            isPasswordValid = bcrypt.compareSync(password, user.password_hash);
          } else if (typeof dcodeIO !== "undefined" && dcodeIO.bcrypt) {
            isPasswordValid = dcodeIO.bcrypt.compareSync(
              password,
              user.password_hash
            );
          } else {
            isPasswordValid = user.password_hash === password;
          }

          if (isPasswordValid) {
            this.isLoggedIn = true;
            this.isAdmin = true;
            this.currentUser = user;
            const sessionToken = this.generateSessionToken();
            sessionStorage.setItem("userSession", sessionToken);
            sessionStorage.setItem("userId", user.id);
            sessionStorage.setItem("username", user.username);
            await this.supabase
              .from("users")
              .update({ last_login: new Date().toISOString() })
              .eq("id", user.id);

            this.hideLoading();
            this.hideLoginScreen();
            await this.loadApp();
          } else {
            throw new Error("Invalid password");
          }
        } else {
          throw new Error("User not found");
        }
      } else {
        if (password === ADMIN_PASSWORD) {
          this.isLoggedIn = true;
          this.isAdmin = true;
          sessionStorage.setItem("userSession", "local-" + Date.now());
          sessionStorage.setItem("username", username);

          this.hideLoading();
          this.hideLoginScreen();
          await this.loadApp();
        } else {
          throw new Error("Invalid password");
        }
      }
    } catch (error) {
      this.hideLoading();
      errorDiv.textContent = "Nieprawidłowy login lub hasło";
      errorDiv.classList.add("show");
    }
  },

  generateSessionToken() {
    return (
      "session_" +
      Math.random().toString(36).substring(2) +
      Date.now().toString(36)
    );
  },

  async verifySession(userId, sessionToken) {
    if (!this.supabase) return true;

    try {
      const { data, error } = await this.supabase
        .from("users")
        .select("id, is_active")
        .eq("id", userId)
        .eq("is_active", true)
        .limit(1);

      return data && data.length > 0;
    } catch (error) {
      return false;
    }
  },

  logout() {
    if (confirm("Czy na pewno chcesz się wylogować?")) {
      sessionStorage.clear();
      this.isLoggedIn = false;
      this.isAdmin = false;
      this.currentUser = null;
      this.showLoginScreen();
      document.getElementById("main-login-form").reset();
      document.getElementById("login-error").classList.remove("show");
    }
  },
  setupSearch() {
    const searchInput = document.getElementById("search-input");
    if (searchInput) {
      searchInput.addEventListener("input", (e) => {
        this.searchQuery = e.target.value.toLowerCase().trim();
        this.renderTeachersGrid();
      });
    }
  },

  filterTeachers() {
    if (!this.searchQuery) return this.teachers;

    return this.teachers.filter((teacher) => {
      const firstName = (
        teacher.first_name ||
        teacher.firstName ||
        ""
      ).toLowerCase();
      const lastName = (
        teacher.last_name ||
        teacher.lastName ||
        ""
      ).toLowerCase();
      const description = (teacher.description || "").toLowerCase();
      const fullName = `${firstName} ${lastName}`;

      return (
        fullName.includes(this.searchQuery) ||
        description.includes(this.searchQuery)
      );
    });
  },
  async loadTeachersFromSupabase() {
    try {
      if (!this.supabase) {
        return;
      }
      const { data, error } = await this.supabase
        .from("teachers")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      this.teachers = data || [];
    } catch (error) {
      this.loadFromLocalStorage();
    }
  },

  async saveTeacherToSupabase(teacher) {
    try {
      if (!this.supabase) {
        return null;
      }
      const { data, error } = await this.supabase
        .from("teachers")
        .insert([
          {
            first_name: teacher.firstName,
            last_name: teacher.lastName,
            description: teacher.description,
            photo_url: teacher.photoUrl || null,
          },
        ])
        .select();

      if (error) throw error;
      return data[0];
    } catch (error) {
      throw error;
    }
  },
  async addTeacher(event) {
    event.preventDefault();

    const firstName = document.getElementById("teacher-firstname").value.trim();
    const lastName = document.getElementById("teacher-lastname").value.trim();
    const description = document
      .getElementById("teacher-description")
      .value.trim()
      .replace(/\\n/g, "\n");
    const photoInput = document.getElementById("teacher-photo");
    const photoFile = photoInput.files[0];

    if (!firstName || !lastName) {
      this.showToast("Imię i nazwisko są wymagane!", "error");
      return;
    }

    this.showLoading();

    try {
      let photoUrl = "https://via.placeholder.com/150";

      if (this.supabase) {
        if (photoFile) {
          const fileName = `teachers/${Date.now()}_${photoFile.name}`;
          const { data: uploadData, error: uploadError } =
            await this.supabase.storage
              .from("teacher-media")
              .upload(fileName, photoFile);

          if (uploadError) throw uploadError;

          const { data: urlData } = this.supabase.storage
            .from("teacher-media")
            .getPublicUrl(fileName);

          photoUrl = urlData.publicUrl;
        }
        const { data, error } = await this.supabase
          .from("teachers")
          .insert([
            {
              first_name: firstName,
              last_name: lastName,
              description: description,
              photo_url: photoUrl,
            },
          ])
          .select();

        if (error) throw error;

        this.teachers.push(data[0]);
      } else {
        if (photoFile) {
          photoUrl = URL.createObjectURL(photoFile);
        }

        const newTeacher = {
          id: Date.now(),
          firstName,
          lastName,
          description,
          photoUrl,
          media: [],
          quotes: [],
        };

        this.teachers.push(newTeacher);
        this.saveToLocalStorage();
      }

      this.hideLoading();
      this.closeAddTeacherModal();
      await this.renderTeachersGrid();
      this.showToast("Nauczyciel został dodany!", "success");
    } catch (error) {
      this.hideLoading();
      this.showToast(
        "Błąd podczas dodawania nauczyciela: " + error.message,
        "error"
      );
    }
  },

  async updateTeacher(event) {
    event.preventDefault();

    const teacherId = this.editingTeacherId;
    const firstName = document
      .getElementById("edit-teacher-firstname")
      .value.trim();
    const lastName = document
      .getElementById("edit-teacher-lastname")
      .value.trim();
    const description = document
      .getElementById("edit-teacher-description")
      .value.trim()
      .replace(/\\n/g, "\n");

    if (!firstName || !lastName) {
      this.showToast("Imię i nazwisko są wymagane!", "error");
      return;
    }

    this.showLoading();

    try {
      if (this.supabase) {
        const { error } = await this.supabase
          .from("teachers")
          .update({
            first_name: firstName,
            last_name: lastName,
            description: description,
          })
          .eq("id", teacherId);

        if (error) throw error;
        const teacher = this.teachers.find((t) => t.id === teacherId);
        if (teacher) {
          teacher.first_name = firstName;
          teacher.last_name = lastName;
          teacher.description = description;
        }
      } else {
        const teacher = this.teachers.find((t) => t.id === teacherId);
        if (teacher) {
          teacher.firstName = firstName;
          teacher.lastName = lastName;
          teacher.description = description;
          this.saveToLocalStorage();
        }
      }

      this.hideLoading();
      this.closeEditTeacherModal();
      await this.renderTeachersGrid();
      if (this.currentTeacherId === teacherId) {
        await this.showTeacherDetail(teacherId);
      }

      this.showToast("Dane nauczyciela zostały zaktualizowane!", "success");
    } catch (error) {
      this.hideLoading();
      this.showToast(
        "Błąd podczas aktualizacji nauczyciela: " + error.message,
        "error"
      );
    }
  },

  async deleteTeacher(teacherId) {
    if (
      !confirm(
        "Czy na pewno chcesz usunąć tego nauczyciela? Wszystkie zdjęcia i cytaty zostaną również usunięte."
      )
    ) {
      return;
    }

    this.showLoading();

    try {
      if (this.supabase) {
        await this.deleteTeacherFromSupabase(teacherId);
        this.teachers = this.teachers.filter((t) => t.id !== teacherId);
      } else {
        this.teachers = this.teachers.filter((t) => t.id !== teacherId);
        this.saveToLocalStorage();
      }

      this.hideLoading();
      const detailModal = document.getElementById("teacher-detail");
      if (detailModal && detailModal.classList.contains("active")) {
        detailModal.classList.remove("active");
        document.body.style.overflow = "auto";
      }
      this.showMainView();

      this.showToast("Nauczyciel został usunięty", "success");
    } catch (error) {
      this.hideLoading();
      this.showToast(
        "Błąd podczas usuwania nauczyciela: " + error.message,
        "error"
      );
    }
  },

  async deleteTeacherFromSupabase(teacherId) {
    try {
      if (!this.supabase) {
        return;
      }
      const { error: mediaError } = await this.supabase
        .from("media")
        .delete()
        .eq("teacher_id", teacherId);

      if (mediaError) throw mediaError;
      const { error } = await this.supabase
        .from("teachers")
        .delete()
        .eq("id", teacherId);

      if (error) throw error;
    } catch (error) {
      throw error;
    }
  },

  async uploadMediaToSupabase(teacherId, file, category) {
    try {
      if (!this.supabase) {
        return null;
      }
      this.showLoading();
      const fileName = `${teacherId}/${category}/${Date.now()}_${file.name}`;
      const { data: uploadData, error: uploadError } =
        await this.supabase.storage
          .from("teacher-media")
          .upload(fileName, file);

      if (uploadError) throw uploadError;
      const { data: urlData } = this.supabase.storage
        .from("teacher-media")
        .getPublicUrl(fileName);
      const { data, error } = await this.supabase
        .from("media")
        .insert([
          {
            teacher_id: teacherId,
            category: category,
            file_path: fileName,
            file_url: urlData.publicUrl,
            file_type: file.type,
            file_name: file.name,
          },
        ])
        .select();

      if (error) throw error;

      this.hideLoading();
      return data[0];
    } catch (error) {
      this.hideLoading();
      throw error;
    }
  },

  async loadMediaFromSupabase(teacherId, category) {
    try {
      if (!this.supabase) {
        return [];
      }
      const { data, error } = await this.supabase
        .from("media")
        .select("*")
        .eq("teacher_id", teacherId)
        .eq("category", category)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data || [];
    } catch (error) {
      return [];
    }
  },

  async deleteMediaFromSupabase(mediaId, filePath) {
    try {
      if (!this.supabase) {
        return;
      }
      this.showLoading();
      const { error: storageError } = await this.supabase.storage
        .from("teacher-media")
        .remove([filePath]);

      if (storageError) throw storageError;
      const { error } = await this.supabase
        .from("media")
        .delete()
        .eq("id", mediaId);

      if (error) throw error;

      this.hideLoading();
    } catch (error) {
      this.hideLoading();
      throw error;
    }
  },
  loadFromLocalStorage() {
    const stored = localStorage.getItem("teachersData");
    if (stored) {
      this.teachers = JSON.parse(stored);
    }
  },

  saveToLocalStorage() {
    localStorage.setItem("teachersData", JSON.stringify(this.teachers));
  },
  showLoading() {
    document.getElementById("loading-overlay").classList.add("active");
  },

  hideLoading() {
    document.getElementById("loading-overlay").classList.remove("active");
  },
  showToast(message, type = "info", duration = 4000) {
    const container = document.getElementById("toast-container");
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    const icons = {
      success: '<path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>',
      error:
        '<path d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"/>',
      warning:
        '<path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>',
      info: '<path d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>',
    };

    toast.innerHTML = `
      <div class="toast-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          ${icons[type]}
        </svg>
      </div>
      <div class="toast-content">${message}</div>
      <button class="toast-close">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M6 18L18 6M6 6l12 12"/>
        </svg>
      </button>
    `;

    container.appendChild(toast);
    const closeBtn = toast.querySelector(".toast-close");
    closeBtn.onclick = () => this.removeToast(toast);
    if (duration > 0) {
      setTimeout(() => this.removeToast(toast), duration);
    }

    return toast;
  },

  removeToast(toast) {
    toast.classList.add("removing");
    setTimeout(() => {
      if (toast.parentElement) {
        toast.parentElement.removeChild(toast);
      }
    }, 300);
  },
  formatTextWithColors(text) {
    if (!text) return "";
    return text
      .replace(/\n/g, "<br>")
      .replace(/\[([#\w]+):([^\]]+)\]/g, '<span style="color: $1">$2</span>');
  },
  updateAdminUI() {
    const addBtn = document.getElementById("add-teacher-btn");
    const logoutBtn = document.getElementById("admin-logout-btn");
    const deleteMediaBtn = document.getElementById("delete-media-btn");

    if (this.isAdmin) {
      if (addBtn) addBtn.style.display = "inline-flex";
      if (logoutBtn) logoutBtn.style.display = "inline-flex";
      if (deleteMediaBtn) deleteMediaBtn.style.display = "inline-flex";
    } else {
      if (addBtn) addBtn.style.display = "none";
      if (logoutBtn) logoutBtn.style.display = "none";
      if (deleteMediaBtn) deleteMediaBtn.style.display = "none";
    }
  },
  async renderRecentlyAdded() {
    const grid = document.getElementById("recently-added-grid");
    grid.innerHTML = "";

    let allMedia = [];

    if (this.supabase) {
      try {
        const { data, error } = await supabase
          .from("media")
          .select("*, teachers(first_name, last_name)")
          .order("created_at", { ascending: false })
          .limit(6);

        if (!error && data) {
          allMedia = data.map((m) => ({
            ...m,
            teacherName: `${m.teachers.first_name} ${m.teachers.last_name}`,
          }));
        }
      } catch (error) {}
    } else {
      this.teachers.forEach((teacher) => {
        const teacherName = `${teacher.firstName || ""} ${
          teacher.lastName || ""
        }`;
        if (teacher.media) {
          teacher.media.forEach((media) => {
            allMedia.push({
              ...media,
              teacherName,
              teacherId: teacher.id,
            });
          });
        }
      });
      allMedia.sort(
        (a, b) => new Date(b.uploadedAt || 0) - new Date(a.uploadedAt || 0)
      );
      allMedia = allMedia.slice(0, 6);
    }

    if (allMedia.length === 0) {
      grid.innerHTML =
        '<p style="color: var(--text-muted); text-align: center; padding: 2rem;">Brak ostatnio dodanych plików</p>';
      return;
    }

    allMedia.forEach((media) => {
      const item = document.createElement("div");
      item.className = "recently-added-item";

      const isVideo =
        media.file_type?.startsWith("video/") ||
        media.type?.startsWith("video/");

      if (isVideo) {
        const video = document.createElement("video");
        video.src = media.file_url || media.url;
        video.muted = true;
        item.appendChild(video);
      } else {
        const img = document.createElement("img");
        img.src = media.file_url || media.url;
        img.alt = media.teacherName;
        item.appendChild(img);
      }

      const badge = document.createElement("div");
      badge.className = "teacher-badge";
      badge.textContent = media.teacherName;
      item.appendChild(badge);

      grid.appendChild(item);
    });
  },

  renderTeachersGrid() {
    const grid = document.getElementById("people-grid");
    const emptyState = document.getElementById("main-empty-state");

    grid.innerHTML = "";
    const filteredTeachers = this.filterTeachers();

    if (filteredTeachers.length === 0) {
      emptyState.style.display = "block";
      if (this.searchQuery) {
        emptyState.innerHTML = `
          <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <circle cx="11" cy="11" r="8"></circle>
            <path d="m21 21-4.35-4.35"></path>
          </svg>
          <p>Nie znaleziono nauczycieli</p>
          <p class="empty-hint">Spróbuj zmienić zapytanie</p>
        `;
      } else {
        emptyState.innerHTML = `
          <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
          <p>Brak nauczycieli</p>
          <p class="empty-hint">Dodaj pierwszego nauczyciela, aby rozpocząć</p>
        `;
      }
      return;
    }

    emptyState.style.display = "none";

    filteredTeachers.forEach(async (teacher) => {
      const card = document.createElement("div");
      card.className = "person-card";
      card.onclick = () => this.showTeacherDetail(teacher.id);

      const initials = `${
        teacher.first_name?.[0] || teacher.firstName?.[0] || ""
      }${teacher.last_name?.[0] || teacher.lastName?.[0] || ""}`.toUpperCase();
      const fullName = `${teacher.first_name || teacher.firstName || ""} ${
        teacher.last_name || teacher.lastName || ""
      }`;
      const description = teacher.description || "";
      const photoUrl = teacher.photo_url || teacher.photoUrl;
      let aiCount = 0;
      let naturalCount = 0;
      let quotesCount = 0;

      if (this.supabase) {
        const { data: mediaData } = await this.supabase
          .from("media")
          .select("category", { count: "exact" })
          .eq("teacher_id", teacher.id);

        if (mediaData) {
          aiCount = mediaData.filter((m) => m.category === "ai").length;
          naturalCount = mediaData.filter(
            (m) => m.category === "natural"
          ).length;
        }

        const { data: quotesData } = await this.supabase
          .from("quotes")
          .select("id", { count: "exact" })
          .eq("teacher_id", teacher.id);

        if (quotesData) {
          quotesCount = quotesData.length;
        }
      } else {
        aiCount = teacher.media?.filter((m) => m.category === "ai").length || 0;
        naturalCount =
          teacher.media?.filter((m) => m.category === "natural").length || 0;
        quotesCount = teacher.quotes?.length || 0;
      }

      const avatarContent = photoUrl
        ? `<img src="${photoUrl}" alt="${fullName}">`
        : initials;

      card.innerHTML = `
        <div class="person-avatar">${avatarContent}</div>
        <h3>${this.formatTextWithColors(fullName)}</h3>
        ${description ? `<p>${this.formatTextWithColors(description)}</p>` : ""}
        <div class="image-count">
          <span>Natural: <span class="count-badge">${naturalCount}</span></span>
          <span>AI: <span class="count-badge">${aiCount}</span></span>
          <span>Cytaty: <span class="count-badge">${quotesCount}</span></span>
        </div>
      `;

      grid.appendChild(card);
    });
  },

  async showTeacherDetail(teacherId) {
    this.currentTeacherId = teacherId;
    const teacher = this.teachers.find((t) => t.id === teacherId);

    const fullName = `${teacher.first_name || teacher.firstName || ""} ${
      teacher.last_name || teacher.lastName || ""
    }`;
    document.getElementById("person-name").innerHTML =
      this.formatTextWithColors(fullName);

    const descElement = document.getElementById("person-description");
    if (teacher.description) {
      descElement.innerHTML = this.formatTextWithColors(teacher.description);
      descElement.style.display = "block";
    } else {
      descElement.style.display = "none";
    }

    document.getElementById("main-view").classList.remove("active");
    document.getElementById("detail-view").classList.add("active");
    const deleteBtn = document.querySelector(".delete-teacher-btn");
    const editBtn = document.querySelector(".edit-teacher-btn");
    if (deleteBtn) {
      deleteBtn.style.display = this.isAdmin ? "inline-flex" : "none";
      deleteBtn.onclick = () => this.deleteTeacher(teacherId);
    }
    if (editBtn) {
      editBtn.style.display = this.isAdmin ? "inline-flex" : "none";
      editBtn.onclick = () => this.showEditTeacherModal(teacherId);
    }

    this.updateAdminUI();
    this.switchTab("natural");
  },

  showMainView() {
    document.getElementById("detail-view").classList.remove("active");
    document.getElementById("main-view").classList.add("active");
    this.currentTeacherId = null;
    const deleteBtn = document.querySelector(".delete-teacher-btn");
    const editBtn = document.querySelector(".edit-teacher-btn");
    if (deleteBtn) {
      deleteBtn.style.display = "none";
    }
    if (editBtn) {
      editBtn.style.display = "none";
    }

    this.renderTeachersGrid();
    this.renderRecentlyAdded();
  },

  async switchTab(tab) {
    this.currentTab = tab;
    document.querySelectorAll(".tab-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.tab === tab);
    });
    document.getElementById("current-tab-name").textContent = tab.toUpperCase();
    const uploadSection = document.querySelector(".upload-section");
    if (tab === "quotes") {
      uploadSection.style.display = "none";
      await this.renderQuotes();
    } else {
      uploadSection.style.display = "block";
      await this.renderMedia();
    }
  },

  async renderMedia() {
    const grid = document.getElementById("images-grid");
    const emptyState = document.getElementById("empty-state");
    const imagesSection = document.querySelector(".images-section");
    if (imagesSection) {
      const existingToolbar = imagesSection.querySelector(".media-toolbar");
      if (existingToolbar) {
        existingToolbar.remove();
      }
    }
    grid.style.display = "grid";
    const quotesWrapper = document.getElementById("quotes-wrapper");
    if (quotesWrapper) {
      quotesWrapper.style.display = "none";
    }

    grid.innerHTML = "";

    let mediaItems = [];

    if (this.supabase) {
      mediaItems = await this.loadMediaFromSupabase(
        this.currentTeacherId,
        this.currentTab
      );
    } else {
      const teacher = this.teachers.find((t) => t.id === this.currentTeacherId);
      mediaItems =
        teacher?.media?.filter((m) => m.category === this.currentTab) || [];
    }
    this.currentMediaItems = mediaItems;
    if (this.isAdmin && mediaItems.length > 0) {
      const toolbar = document.createElement("div");
      toolbar.className = "media-toolbar";
      toolbar.innerHTML = `
        <button class="btn-select-all" onclick="app.selectAllMedia()">Zaznacz wszystko</button>
        <button class="btn-deselect-all" onclick="app.deselectAllMedia()">Odznacz wszystko</button>
        <button class="btn-delete-selected" onclick="app.deleteSelectedMedia()">Usuń zaznaczone (<span id="selected-count">0</span>)</button>
      `;
      imagesSection.insertBefore(toolbar, grid);
    }

    if (mediaItems.length === 0) {
      emptyState.classList.remove("hidden");
      emptyState.style.display = "block";
      grid.style.display = "none";
    } else {
      emptyState.classList.add("hidden");
      emptyState.style.display = "none";
      grid.style.display = "grid";

      mediaItems.forEach((media, index) => {
        const item = document.createElement("div");
        item.className = "image-item";
        item.dataset.mediaId = media.id;
        item.dataset.filePath = media.file_path || media.path;
        if (this.isAdmin) {
          const checkbox = document.createElement("input");
          checkbox.type = "checkbox";
          checkbox.className = "media-checkbox";
          checkbox.onclick = (e) => {
            e.stopPropagation();
            this.updateSelectedCount();
          };
          item.appendChild(checkbox);
        }
        const actionsDiv = document.createElement("div");
        actionsDiv.className = "media-actions";
        const openBtn = document.createElement("button");
        openBtn.className = "media-action-btn";
        openBtn.title = "Otwórz w nowej karcie";
        openBtn.innerHTML = `
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
            <polyline points="15 3 21 3 21 9"></polyline>
            <line x1="10" y1="14" x2="21" y2="3"></line>
          </svg>
        `;
        openBtn.onclick = (e) => {
          e.stopPropagation();
          const url = media.file_url || media.url;
          window.open(url, "_blank");
        };
        actionsDiv.appendChild(openBtn);

        item.appendChild(actionsDiv);

        const isVideo =
          media.file_type?.startsWith("video/") ||
          media.type?.startsWith("video/");

        const mediaWrapper = document.createElement("div");
        mediaWrapper.className = "media-wrapper";
        mediaWrapper.onclick = () => this.showMediaModal(index, mediaItems);

        if (isVideo) {
          const video = document.createElement("video");
          video.src = media.file_url || media.url;
          video.muted = true;
          mediaWrapper.appendChild(video);

          const badge = document.createElement("div");
          badge.className = "media-type-badge";
          badge.textContent = "▶ VIDEO";
          mediaWrapper.appendChild(badge);
        } else {
          const img = document.createElement("img");
          img.src = media.file_url || media.url;
          img.alt = media.file_name || media.name || "Media";
          mediaWrapper.appendChild(img);
        }

        item.appendChild(mediaWrapper);
        grid.appendChild(item);
      });
    }
  },
  selectAllMedia() {
    document
      .querySelectorAll(".media-checkbox")
      .forEach((cb) => (cb.checked = true));
    this.updateSelectedCount();
  },

  deselectAllMedia() {
    document
      .querySelectorAll(".media-checkbox")
      .forEach((cb) => (cb.checked = false));
    this.updateSelectedCount();
  },

  updateSelectedCount() {
    const count = document.querySelectorAll(".media-checkbox:checked").length;
    const countSpan = document.getElementById("selected-count");
    if (countSpan) {
      countSpan.textContent = count;
    }
  },

  async deleteSelectedMedia() {
    const selectedCheckboxes = document.querySelectorAll(
      ".media-checkbox:checked"
    );
    const count = selectedCheckboxes.length;

    if (count === 0) {
      this.showToast("Nie zaznaczono żadnych plików", "warning");
      return;
    }

    if (
      !confirm(
        `Czy na pewno chcesz usunąć ${count} ${
          count === 1 ? "plik" : "plików"
        }?`
      )
    ) {
      return;
    }

    this.showLoading();

    try {
      for (const checkbox of selectedCheckboxes) {
        const item = checkbox.closest(".image-item");
        const mediaId = item.dataset.mediaId;
        const filePath = item.dataset.filePath;

        if (this.supabase) {
          await this.deleteMediaFromSupabase(mediaId, filePath);
        } else {
          const teacher = this.teachers.find(
            (t) => t.id === this.currentTeacherId
          );
          if (teacher && teacher.media) {
            teacher.media = teacher.media.filter((m) => m.id !== mediaId);
            this.saveToLocalStorage();
          }
        }
      }

      this.hideLoading();
      this.showToast(
        `Usunięto ${count} ${count === 1 ? "plik" : "plików"}`,
        "success"
      );
      await this.renderMedia();
      await this.renderRecentlyAdded();
    } catch (error) {
      this.hideLoading();
      this.showToast("Błąd podczas usuwania plików", "error");
    }
  },
  async renderQuotes() {
    const section = document.querySelector(".images-section");
    const titleSpan = document.getElementById("current-tab-name");
    const imagesGrid = document.getElementById("images-grid");
    const emptyState = document.getElementById("empty-state");
    if (section) {
      const existingToolbar = section.querySelector(".media-toolbar");
      if (existingToolbar) {
        existingToolbar.remove();
      }
    }
    imagesGrid.style.display = "none";
    emptyState.classList.add("hidden");
    emptyState.style.display = "none";
    let quotesWrapper = document.getElementById("quotes-wrapper");
    if (!quotesWrapper) {
      quotesWrapper = document.createElement("div");
      quotesWrapper.id = "quotes-wrapper";
      section.appendChild(quotesWrapper);
    }

    quotesWrapper.style.display = "block";
    quotesWrapper.innerHTML = `
      <button class="add-quote-btn" onclick="app.showAddQuoteModal()" style="display: ${
        this.isAdmin ? "inline-flex" : "none"
      };">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 5v14M5 12h14" />
        </svg>
        Dodaj Cytat
      </button>
      <div class="quotes-container" id="quotes-container"></div>
    `;

    const container = document.getElementById("quotes-container");
    let quotes = [];

    if (this.supabase) {
      try {
        const { data, error } = await this.supabase
          .from("quotes")
          .select("*")
          .eq("teacher_id", this.currentTeacherId)
          .order("created_at", { ascending: false });

        if (!error && data) {
          quotes = data;
        }
      } catch (error) {}
    } else {
      const teacher = this.teachers.find((t) => t.id === this.currentTeacherId);
      quotes = teacher?.quotes || [];
    }

    if (quotes.length === 0) {
      container.innerHTML =
        '<p style="color: var(--text-muted); text-align: center; padding: 2rem;">Brak cytatów</p>';
      return;
    }

    quotes.forEach((quote) => {
      const item = document.createElement("div");
      item.className = "quote-item";
      item.innerHTML = `
        <div class="quote-text">"${quote.text || quote.quote_text}"</div>
        ${
          quote.author || quote.quote_author
            ? `<div class="quote-author">— ${
                quote.author || quote.quote_author
              }</div>`
            : ""
        }
        <button class="quote-delete-btn" onclick="app.deleteQuote('${
          quote.id
        }')" style="display: ${this.isAdmin ? "flex" : "none"};">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      `;
      container.appendChild(item);
    });
  },

  showAddQuoteModal() {
    document.getElementById("add-quote-modal").classList.add("active");
    document.body.style.overflow = "hidden";
  },

  closeAddQuoteModal() {
    document.getElementById("add-quote-modal").classList.remove("active");
    document.body.style.overflow = "auto";
    document.getElementById("add-quote-form").reset();
  },

  async addQuote(event) {
    event.preventDefault();

    const text = document.getElementById("quote-text").value.trim();
    const author = document.getElementById("quote-author").value.trim();

    if (!text) return;

    try {
      this.showLoading();

      if (this.supabase) {
        const { error } = await this.supabase.from("quotes").insert([
          {
            teacher_id: this.currentTeacherId,
            quote_text: text,
            quote_author: author,
          },
        ]);

        if (error) throw error;
      } else {
        const teacher = this.teachers.find(
          (t) => t.id === this.currentTeacherId
        );
        if (!teacher.quotes) teacher.quotes = [];
        teacher.quotes.push({
          id: Date.now(),
          text,
          author,
          createdAt: new Date().toISOString(),
        });
        this.saveToLocalStorage();
      }

      this.hideLoading();
      this.closeAddQuoteModal();
      await this.renderQuotes();
      this.renderTeachersGrid();
    } catch (error) {
      this.hideLoading();
      this.showToast(
        "Błąd podczas dodawania cytatu: " + error.message,
        "error"
      );
    }
  },

  async deleteQuote(quoteId) {
    if (!confirm("Czy na pewno chcesz usunąć ten cytat?")) return;

    try {
      this.showLoading();

      if (this.supabase) {
        const { error } = await this.supabase
          .from("quotes")
          .delete()
          .eq("id", quoteId);
        if (error) throw error;
      } else {
        const teacher = this.teachers.find(
          (t) => t.id === this.currentTeacherId
        );
        teacher.quotes = teacher.quotes.filter((q) => q.id !== quoteId);
        this.saveToLocalStorage();
      }

      this.hideLoading();
      await this.renderQuotes();
      this.renderTeachersGrid();
    } catch (error) {
      this.hideLoading();
      this.showToast("Błąd podczas usuwania cytatu: " + error.message, "error");
    }
  },
  showAddTeacherModal() {
    const modal = document.getElementById("add-teacher-modal");
    modal.classList.add("active");
    document.body.style.overflow = "hidden";
  },

  closeAddTeacherModal() {
    const modal = document.getElementById("add-teacher-modal");
    modal.classList.remove("active");
    document.body.style.overflow = "auto";
    document.getElementById("add-teacher-form").reset();
  },

  showEditTeacherModal(teacherId) {
    const teacher = this.teachers.find((t) => t.id === teacherId);
    if (!teacher) return;

    this.editingTeacherId = teacherId;

    const modal = document.getElementById("edit-teacher-modal");
    document.getElementById("edit-teacher-firstname").value =
      teacher.first_name || teacher.firstName;
    document.getElementById("edit-teacher-lastname").value =
      teacher.last_name || teacher.lastName;
    document.getElementById("edit-teacher-description").value =
      teacher.description || "";

    modal.classList.add("active");
    document.body.style.overflow = "hidden";
  },

  closeEditTeacherModal() {
    const modal = document.getElementById("edit-teacher-modal");
    modal.classList.remove("active");
    document.body.style.overflow = "auto";
    document.getElementById("edit-teacher-form").reset();
    this.editingTeacherId = null;
  },

  showAddQuoteModal() {
    const modal = document.getElementById("add-quote-modal");
    modal.classList.add("active");
    document.body.style.overflow = "hidden";
  },

  closeAddQuoteModal() {
    const modal = document.getElementById("add-quote-modal");
    modal.classList.remove("active");
    document.body.style.overflow = "auto";
    document.getElementById("add-quote-form").reset();
  },
  setupEventListeners() {
    const uploadArea = document.getElementById("upload-area");
    const fileInput = document.getElementById("file-input");
    this.setupSearch();

    fileInput.addEventListener("change", (e) => {
      this.handleFiles(e.target.files);
    });

    uploadArea.addEventListener("click", (e) => {
      if (e.target !== fileInput && this.currentTeacherId) {
        fileInput.click();
      }
    });

    uploadArea.addEventListener("dragover", (e) => {
      e.preventDefault();
      uploadArea.classList.add("drag-over");
    });

    uploadArea.addEventListener("dragleave", () => {
      uploadArea.classList.remove("drag-over");
    });

    uploadArea.addEventListener("drop", (e) => {
      e.preventDefault();
      uploadArea.classList.remove("drag-over");
      if (this.currentTeacherId) {
        this.handleFiles(e.dataTransfer.files);
      }
    });
    document.getElementById("image-modal").addEventListener("click", (e) => {
      if (e.target.id === "image-modal") {
        this.closeModal();
      }
    });

    document
      .getElementById("add-teacher-modal")
      .addEventListener("click", (e) => {
        if (e.target.id === "add-teacher-modal") {
          this.closeAddTeacherModal();
        }
      });
    document.addEventListener("keydown", (e) => {
      const modal = document.getElementById("image-modal");
      if (modal.classList.contains("active")) {
        if (e.key === "Escape") {
          this.closeModal();
        } else if (e.key === "ArrowRight") {
          this.nextMedia();
        } else if (e.key === "ArrowLeft") {
          this.prevMedia();
        } else if (e.key === "Delete") {
          this.deleteCurrentMedia();
        }
      }
    });
  },

  async handleFiles(files) {
    if (!this.currentTeacherId) return;

    for (const file of Array.from(files)) {
      if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) {
        this.showToast(
          "Proszę przesyłać tylko pliki graficzne lub wideo",
          "warning"
        );
        continue;
      }

      if (file.size > 50 * 1024 * 1024) {
        this.showToast("Rozmiar pliku nie może przekraczać 50MB", "warning");
        continue;
      }

      try {
        if (this.supabase) {
          await this.uploadMediaToSupabase(
            this.currentTeacherId,
            file,
            this.currentTab
          );
        } else {
          const reader = new FileReader();
          reader.onload = (e) => {
            const teacher = this.teachers.find(
              (t) => t.id === this.currentTeacherId
            );
            if (!teacher.media) teacher.media = [];

            teacher.media.push({
              id: Date.now(),
              category: this.currentTab,
              url: e.target.result,
              type: file.type,
              name: file.name,
              uploadedAt: new Date().toISOString(),
            });

            this.saveToLocalStorage();
            this.renderMedia();
          };
          reader.readAsDataURL(file);
        }
      } catch (error) {
        this.showToast(
          "Błąd podczas przesyłania pliku: " + error.message,
          "error"
        );
      }
    }

    if (this.supabase) {
      await this.renderMedia();
    }

    const fileInput = document.getElementById("file-input");
    if (fileInput) {
      fileInput.value = "";
    }
  },
  showMediaModal(index, mediaItems, event) {
    if (event) event.stopPropagation();
    if (typeof mediaItems === "string") {
      try {
        mediaItems = JSON.parse(mediaItems.replace(/&quot;/g, '"'));
      } catch (e) {
        mediaItems = this.currentMediaItems;
      }
    }

    this.currentMediaIndex = index;
    this.currentMediaItems = mediaItems;

    const modal = document.getElementById("image-modal");
    const modalImage = document.getElementById("modal-image");
    const modalVideo = document.getElementById("modal-video");
    const deleteMediaBtn = document.getElementById("delete-media-btn");

    const media = mediaItems[index];
    const isVideo =
      media.file_type?.startsWith("video/") || media.type?.startsWith("video/");

    if (isVideo) {
      modalImage.style.display = "none";
      modalVideo.style.display = "block";
      modalVideo.src = media.file_url || media.url;
    } else {
      modalVideo.style.display = "none";
      modalImage.style.display = "block";
      modalImage.src = media.file_url || media.url;
    }
    if (deleteMediaBtn) {
      deleteMediaBtn.style.display = this.isAdmin ? "inline-flex" : "none";
    }

    modal.classList.add("active");
    document.body.style.overflow = "hidden";
  },

  closeModal() {
    const modal = document.getElementById("image-modal");
    const modalVideo = document.getElementById("modal-video");

    modal.classList.remove("active");
    modalVideo.pause();
    document.body.style.overflow = "auto";
    this.currentMediaIndex = null;
    this.currentMediaItems = null;
  },

  async downloadCurrentMedia() {
    if (this.currentMediaItems && this.currentMediaIndex !== null) {
      const mediaItem = this.currentMediaItems[this.currentMediaIndex];
      const url = mediaItem.file_url || mediaItem.url;

      try {
        const response = await fetch(url);
        const blob = await response.blob();
        const downloadUrl = window.URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = downloadUrl;
        const fileName =
          mediaItem.file_path ||
          `media_${Date.now()}${mediaItem.type === "video" ? ".mp4" : ".jpg"}`;
        link.download = fileName.split("/").pop();
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(downloadUrl);
      } catch (error) {
        this.showToast(
          "Nie udało się pobrać pliku. Spróbuj ponownie.",
          "error"
        );
      }
    }
  },

  nextMedia() {
    if (this.currentMediaIndex < this.currentMediaItems.length - 1) {
      this.currentMediaIndex++;
      this.updateModalMedia();
    }
  },

  prevMedia() {
    if (this.currentMediaIndex > 0) {
      this.currentMediaIndex--;
      this.updateModalMedia();
    }
  },

  updateModalMedia() {
    const modalImage = document.getElementById("modal-image");
    const modalVideo = document.getElementById("modal-video");
    const media = this.currentMediaItems[this.currentMediaIndex];

    const isVideo =
      media.file_type?.startsWith("video/") || media.type?.startsWith("video/");

    if (isVideo) {
      modalImage.style.display = "none";
      modalVideo.style.display = "block";
      modalVideo.src = media.file_url || media.url;
    } else {
      modalVideo.style.display = "none";
      modalVideo.pause();
      modalImage.style.display = "block";
      modalImage.src = media.file_url || media.url;
    }
  },

  async deleteCurrentMedia() {
    if (this.currentMediaIndex === null) return;

    if (!confirm("Czy na pewno chcesz usunąć ten plik?")) return;

    try {
      const media = this.currentMediaItems[this.currentMediaIndex];

      if (this.supabase) {
        await this.deleteMediaFromSupabase(media.id, media.file_path);
      } else {
        const teacher = this.teachers.find(
          (t) => t.id === this.currentTeacherId
        );
        teacher.media = teacher.media.filter((m) => m.id !== media.id);
        this.saveToLocalStorage();
      }

      this.closeModal();
      await this.renderMedia();
    } catch (error) {
      this.showToast("Błąd podczas usuwania pliku: " + error.message, "error");
    }
  },
};
document.addEventListener("DOMContentLoaded", () => {
  app.init();
});
