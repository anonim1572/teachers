// Supabase Client - will be initialized from config.js
let supabase = null;

// Admin password - change this!
const ADMIN_PASSWORD = "Mercedes300td";

// Application State
const app = {
  teachers: [],
  currentTeacherId: null,
  currentTab: "natural", // 'natural', 'ai', or 'quotes'
  currentMediaIndex: null,
  isAdmin: false,

  async init() {
    // Check if admin is logged in
    this.isAdmin = localStorage.getItem("isAdmin") === "true";

    // Upewnij się że przyciski edycji i usuwania są ukryte na starcie
    const deleteBtn = document.querySelector(".delete-teacher-btn");
    const editBtn = document.querySelector(".edit-teacher-btn");
    if (deleteBtn) {
      deleteBtn.style.display = "none";
    }
    if (editBtn) {
      editBtn.style.display = "none";
    }

    this.updateAdminUI();

    // Initialize Supabase
    if (typeof window.SUPABASE_CONFIG !== "undefined") {
      const { createClient } = supabase;
      supabase = createClient(
        window.SUPABASE_CONFIG.url,
        window.SUPABASE_CONFIG.anonKey
      );
      await this.loadTeachersFromSupabase();
    } else {
      console.warn("Supabase not configured. Using localStorage fallback.");
      this.loadFromLocalStorage();
    }

    this.renderTeachersGrid();
    this.renderRecentlyAdded();
    this.setupEventListeners();
  },

  // ===== SUPABASE METHODS =====
  async loadTeachersFromSupabase() {
    try {
      const { data, error } = await supabase
        .from("teachers")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      this.teachers = data || [];
    } catch (error) {
      console.error("Error loading teachers:", error);
      this.loadFromLocalStorage();
    }
  },

  async saveTeacherToSupabase(teacher) {
    try {
      const { data, error } = await supabase
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
      console.error("Error saving teacher:", error);
      throw error;
    }
  },

  async deleteTeacherFromSupabase(teacherId) {
    try {
      // Delete all media first
      const { error: mediaError } = await supabase
        .from("media")
        .delete()
        .eq("teacher_id", teacherId);

      if (mediaError) throw mediaError;

      // Then delete teacher
      const { error } = await supabase
        .from("teachers")
        .delete()
        .eq("id", teacherId);

      if (error) throw error;
    } catch (error) {
      console.error("Error deleting teacher:", error);
      throw error;
    }
  },

  async uploadMediaToSupabase(teacherId, file, category) {
    try {
      this.showLoading();

      // Upload file to Supabase Storage
      const fileName = `${teacherId}/${category}/${Date.now()}_${file.name}`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("teacher-media")
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: urlData } = supabase.storage
        .from("teacher-media")
        .getPublicUrl(fileName);

      // Save metadata to database
      const { data, error } = await supabase
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
      console.error("Error uploading media:", error);
      throw error;
    }
  },

  async loadMediaFromSupabase(teacherId, category) {
    try {
      const { data, error } = await supabase
        .from("media")
        .select("*")
        .eq("teacher_id", teacherId)
        .eq("category", category)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error("Error loading media:", error);
      return [];
    }
  },

  async deleteMediaFromSupabase(mediaId, filePath) {
    try {
      this.showLoading();

      // Delete from storage
      const { error: storageError } = await supabase.storage
        .from("teacher-media")
        .remove([filePath]);

      if (storageError) throw storageError;

      // Delete from database
      const { error } = await supabase.from("media").delete().eq("id", mediaId);

      if (error) throw error;

      this.hideLoading();
    } catch (error) {
      this.hideLoading();
      console.error("Error deleting media:", error);
      throw error;
    }
  },

  // ===== LOCAL STORAGE FALLBACK =====
  loadFromLocalStorage() {
    const stored = localStorage.getItem("teachersData");
    if (stored) {
      this.teachers = JSON.parse(stored);
    }
  },

  saveToLocalStorage() {
    localStorage.setItem("teachersData", JSON.stringify(this.teachers));
  },

  // ===== UI METHODS =====
  showLoading() {
    document.getElementById("loading-overlay").classList.add("active");
  },

  hideLoading() {
    document.getElementById("loading-overlay").classList.remove("active");
  },

  // ===== ADMIN METHODS =====
  updateAdminUI() {
    const loginBtn = document.getElementById("admin-login-btn");
    const addBtn = document.getElementById("add-teacher-btn");
    const logoutBtn = document.getElementById("admin-logout-btn");
    const deleteMediaBtn = document.getElementById("delete-media-btn");

    if (this.isAdmin) {
      loginBtn.style.display = "none";
      addBtn.style.display = "inline-flex";
      logoutBtn.style.display = "inline-flex";
      if (deleteMediaBtn) deleteMediaBtn.style.display = "inline-flex";
      // Przycisk usuwania nauczyciela będzie pokazywany tylko w showTeacher()
    } else {
      loginBtn.style.display = "inline-flex";
      addBtn.style.display = "none";
      logoutBtn.style.display = "none";
      if (deleteMediaBtn) deleteMediaBtn.style.display = "none";
    }
  },

  showAdminLogin() {
    document.getElementById("admin-login-modal").classList.add("active");
    document.body.style.overflow = "hidden";
  },

  closeAdminLogin() {
    document.getElementById("admin-login-modal").classList.remove("active");
    document.body.style.overflow = "auto";
    document.getElementById("admin-login-form").reset();
  },

  loginAdmin(event) {
    event.preventDefault();
    const password = document.getElementById("admin-password").value;

    if (password === ADMIN_PASSWORD) {
      this.isAdmin = true;
      localStorage.setItem("isAdmin", "true");
      this.updateAdminUI();
      this.closeAdminLogin();
      alert("Zalogowano jako administrator!");
    } else {
      alert("Nieprawidłowe hasło!");
    }
  },

  logoutAdmin() {
    if (confirm("Czy na pewno chcesz się wylogować?")) {
      this.isAdmin = false;
      localStorage.removeItem("isAdmin");

      // Ukryj przyciski edycji i usuwania nauczyciela
      const deleteBtn = document.querySelector(".delete-teacher-btn");
      const editBtn = document.querySelector(".edit-teacher-btn");
      if (deleteBtn) {
        deleteBtn.style.display = "none";
      }
      if (editBtn) {
        editBtn.style.display = "none";
      }

      this.updateAdminUI();
      this.showMainView();
    }
  },

  // ===== RECENTLY ADDED =====
  async renderRecentlyAdded() {
    const grid = document.getElementById("recently-added-grid");
    grid.innerHTML = "";

    let allMedia = [];

    if (supabase) {
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
      } catch (error) {
        console.error("Error loading recently added:", error);
      }
    } else {
      // LocalStorage fallback
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

    if (this.teachers.length === 0) {
      emptyState.style.display = "block";
      return;
    }

    emptyState.style.display = "none";

    this.teachers.forEach((teacher) => {
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

      // Count media (from Supabase structure or localStorage)
      const aiCount =
        teacher.media?.filter((m) => m.category === "ai").length || 0;
      const naturalCount =
        teacher.media?.filter((m) => m.category === "natural").length || 0;
      const quotesCount = teacher.quotes?.length || 0;

      const avatarContent = photoUrl
        ? `<img src="${photoUrl}" alt="${fullName}">`
        : initials;

      card.innerHTML = `
        <div class="person-avatar">${avatarContent}</div>
        <h3>${fullName}</h3>
        ${description ? `<p>${description}</p>` : ""}
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
    document.getElementById("person-name").textContent = fullName;

    const descElement = document.getElementById("person-description");
    if (teacher.description) {
      descElement.textContent = teacher.description;
      descElement.style.display = "block";
    } else {
      descElement.style.display = "none";
    }

    document.getElementById("main-view").classList.remove("active");
    document.getElementById("detail-view").classList.add("active");

    // Pokaż przyciski edycji i usuwania tylko gdy użytkownik jest adminem
    const deleteBtn = document.querySelector(".delete-teacher-btn");
    const editBtn = document.querySelector(".edit-teacher-btn");
    if (deleteBtn) {
      deleteBtn.style.display = this.isAdmin ? "inline-flex" : "none";
    }
    if (editBtn) {
      editBtn.style.display = this.isAdmin ? "inline-flex" : "none";
    }

    this.updateAdminUI();
    this.switchTab("natural");
  },

  showMainView() {
    document.getElementById("detail-view").classList.remove("active");
    document.getElementById("main-view").classList.add("active");
    this.currentTeacherId = null;

    // Ukryj przyciski edycji i usuwania nauczyciela
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

    // Update tab buttons
    document.querySelectorAll(".tab-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.tab === tab);
    });

    // Update tab name
    document.getElementById("current-tab-name").textContent = tab.toUpperCase();

    // Show/hide upload section based on tab
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

    // Pokaż siatkę zdjęć, ukryj cytaty
    grid.style.display = "grid";
    const quotesWrapper = document.getElementById("quotes-wrapper");
    if (quotesWrapper) {
      quotesWrapper.style.display = "none";
    }

    grid.innerHTML = "";

    let mediaItems = [];

    if (supabase) {
      mediaItems = await this.loadMediaFromSupabase(
        this.currentTeacherId,
        this.currentTab
      );
    } else {
      const teacher = this.teachers.find((t) => t.id === this.currentTeacherId);
      mediaItems =
        teacher?.media?.filter((m) => m.category === this.currentTab) || [];
    }

    if (mediaItems.length === 0) {
      emptyState.classList.remove("hidden");
      grid.style.display = "none";
    } else {
      emptyState.classList.add("hidden");
      grid.style.display = "grid";

      mediaItems.forEach((media, index) => {
        const item = document.createElement("div");
        item.className = "image-item";
        item.onclick = () => this.showMediaModal(index, mediaItems);

        const isVideo =
          media.file_type?.startsWith("video/") ||
          media.type?.startsWith("video/");

        if (isVideo) {
          const video = document.createElement("video");
          video.src = media.file_url || media.url;
          video.muted = true;
          item.appendChild(video);

          const badge = document.createElement("div");
          badge.className = "media-type-badge";
          badge.textContent = "▶ VIDEO";
          item.appendChild(badge);
        } else {
          const img = document.createElement("img");
          img.src = media.file_url || media.url;
          img.alt = media.file_name || media.name || "Media";
          item.appendChild(img);
        }

        grid.appendChild(item);
      });
    }
  },

  // ===== ADD TEACHER =====
  showAddTeacherModal() {
    if (!this.isAdmin) {
      alert("Musisz być zalogowany jako administrator!");
      return;
    }
    document.getElementById("add-teacher-modal").classList.add("active");
    document.body.style.overflow = "hidden";

    // Setup photo preview
    const photoInput = document.getElementById("teacher-photo");
    const photoPreview = document.getElementById("photo-preview");

    photoInput.onchange = (e) => {
      const file = e.target.files[0];
      if (file && file.type.startsWith("image/")) {
        const reader = new FileReader();
        reader.onload = (event) => {
          photoPreview.innerHTML = `<img src="${event.target.result}" alt="Preview">`;
        };
        reader.readAsDataURL(file);
      }
    };
  },

  closeAddTeacherModal() {
    document.getElementById("add-teacher-modal").classList.remove("active");
    document.body.style.overflow = "auto";
    document.getElementById("add-teacher-form").reset();
    document.getElementById("photo-preview").innerHTML = "";
  },

  async addTeacher(event) {
    event.preventDefault();

    const firstName = document.getElementById("teacher-firstname").value.trim();
    const lastName = document.getElementById("teacher-lastname").value.trim();
    const description = document
      .getElementById("teacher-description")
      .value.trim();
    const photoFile = document.getElementById("teacher-photo").files[0];

    if (!firstName || !lastName) return;

    try {
      this.showLoading();

      let photoUrl = null;

      // Upload photo if provided
      if (photoFile) {
        if (supabase) {
          const fileName = `profiles/${Date.now()}_${photoFile.name}`;
          const { error: uploadError } = await supabase.storage
            .from("teacher-media")
            .upload(fileName, photoFile);

          if (uploadError) throw uploadError;

          const { data: urlData } = supabase.storage
            .from("teacher-media")
            .getPublicUrl(fileName);

          photoUrl = urlData.publicUrl;
        } else {
          // LocalStorage: use base64
          const reader = new FileReader();
          photoUrl = await new Promise((resolve) => {
            reader.onload = (e) => resolve(e.target.result);
            reader.readAsDataURL(photoFile);
          });
        }
      }

      if (supabase) {
        const newTeacher = await this.saveTeacherToSupabase({
          firstName,
          lastName,
          description,
          photoUrl,
        });
        this.teachers.unshift(newTeacher);
      } else {
        const newTeacher = {
          id: Date.now(),
          firstName,
          lastName,
          description,
          photoUrl,
          media: [],
          quotes: [],
        };
        this.teachers.unshift(newTeacher);
        this.saveToLocalStorage();
      }

      this.hideLoading();
      this.closeAddTeacherModal();
      this.renderTeachersGrid();
      this.renderRecentlyAdded();
    } catch (error) {
      this.hideLoading();
      alert("Błąd podczas dodawania nauczyciela: " + error.message);
    }
  },

  // ===== EDIT TEACHER =====
  showEditTeacherModal() {
    if (!this.isAdmin) {
      alert("Musisz być zalogowany jako administrator!");
      return;
    }

    const teacher = this.teachers.find((t) => t.id === this.currentTeacherId);
    if (!teacher) return;

    // Wypełnij formularz aktualnymi danymi
    document.getElementById("edit-teacher-firstname").value =
      teacher.first_name || teacher.firstName || "";
    document.getElementById("edit-teacher-lastname").value =
      teacher.last_name || teacher.lastName || "";
    document.getElementById("edit-teacher-description").value =
      teacher.description || "";

    document.getElementById("edit-teacher-modal").classList.add("active");
    document.body.style.overflow = "hidden";
  },

  closeEditTeacherModal() {
    document.getElementById("edit-teacher-modal").classList.remove("active");
    document.body.style.overflow = "auto";
    document.getElementById("edit-teacher-form").reset();
  },

  async updateTeacher(event) {
    event.preventDefault();

    const firstName = document
      .getElementById("edit-teacher-firstname")
      .value.trim();
    const lastName = document
      .getElementById("edit-teacher-lastname")
      .value.trim();
    const description = document
      .getElementById("edit-teacher-description")
      .value.trim();

    if (!firstName || !lastName) return;

    try {
      this.showLoading();

      if (supabase) {
        // Update w Supabase
        const { error } = await supabase
          .from("teachers")
          .update({
            first_name: firstName,
            last_name: lastName,
            description: description || null,
          })
          .eq("id", this.currentTeacherId);

        if (error) throw error;
      }

      // Zaktualizuj lokalnie
      const teacherIndex = this.teachers.findIndex(
        (t) => t.id === this.currentTeacherId
      );
      if (teacherIndex !== -1) {
        if (supabase) {
          this.teachers[teacherIndex].first_name = firstName;
          this.teachers[teacherIndex].last_name = lastName;
          this.teachers[teacherIndex].description = description;
        } else {
          this.teachers[teacherIndex].firstName = firstName;
          this.teachers[teacherIndex].lastName = lastName;
          this.teachers[teacherIndex].description = description;
        }
      }

      if (!supabase) {
        this.saveToLocalStorage();
      }

      this.hideLoading();
      this.closeEditTeacherModal();

      // Odśwież widok
      const fullName = `${firstName} ${lastName}`;
      document.getElementById("person-name").textContent = fullName;
      const descElement = document.getElementById("person-description");
      if (description) {
        descElement.textContent = description;
        descElement.style.display = "block";
      } else {
        descElement.style.display = "none";
      }

      this.renderTeachersGrid();
      alert("Dane nauczyciela zostały zaktualizowane!");
    } catch (error) {
      this.hideLoading();
      alert("Błąd podczas aktualizacji nauczyciela: " + error.message);
    }
  },

  async deleteTeacher() {
    if (!this.isAdmin) {
      alert("Musisz być zalogowany jako administrator!");
      return;
    }

    if (
      !confirm(
        "Czy na pewno chcesz usunąć tego nauczyciela? Wszystkie zdjęcia, wideo i cytaty zostaną usunięte."
      )
    ) {
      return;
    }

    try {
      this.showLoading();

      if (supabase) {
        await this.deleteTeacherFromSupabase(this.currentTeacherId);
      }

      this.teachers = this.teachers.filter(
        (t) => t.id !== this.currentTeacherId
      );

      if (!supabase) {
        this.saveToLocalStorage();
      }

      this.hideLoading();
      this.showMainView();
    } catch (error) {
      this.hideLoading();
      alert("Błąd podczas usuwania nauczyciela: " + error.message);
    }
  },

  // ===== QUOTES METHODS =====
  async renderQuotes() {
    const section = document.querySelector(".images-section");
    const titleSpan = document.getElementById("current-tab-name");
    const imagesGrid = document.getElementById("images-grid");
    const emptyState = document.getElementById("empty-state");

    // Ukryj standardową siatkę zdjęć i empty state
    imagesGrid.style.display = "none";
    emptyState.classList.add("hidden");

    // Sprawdź czy kontener cytatów już istnieje
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

    if (supabase) {
      try {
        const { data, error } = await supabase
          .from("quotes")
          .select("*")
          .eq("teacher_id", this.currentTeacherId)
          .order("created_at", { ascending: false });

        if (!error && data) {
          quotes = data;
        }
      } catch (error) {
        console.error("Error loading quotes:", error);
      }
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
        <button class="quote-delete-btn" onclick="app.deleteQuote(${
          quote.id
        })" style="display: ${this.isAdmin ? "flex" : "none"};">
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

      if (supabase) {
        const { error } = await supabase.from("quotes").insert([
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
      alert("Błąd podczas dodawania cytatu: " + error.message);
    }
  },

  async deleteQuote(quoteId) {
    if (!confirm("Czy na pewno chcesz usunąć ten cytat?")) return;

    try {
      this.showLoading();

      if (supabase) {
        const { error } = await supabase
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
      alert("Błąd podczas usuwania cytatu: " + error.message);
    }
  },

  // ===== FILE UPLOAD =====
  setupEventListeners() {
    const uploadArea = document.getElementById("upload-area");
    const fileInput = document.getElementById("file-input");

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

    // Modal clicks
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

    // Keyboard shortcuts
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
        alert("Proszę przesyłać tylko pliki graficzne lub wideo");
        continue;
      }

      if (file.size > 50 * 1024 * 1024) {
        alert("Rozmiar pliku nie może przekraczać 50MB");
        continue;
      }

      try {
        if (supabase) {
          await this.uploadMediaToSupabase(
            this.currentTeacherId,
            file,
            this.currentTab
          );
        } else {
          // LocalStorage fallback
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
        alert("Błąd podczas przesyłania pliku: " + error.message);
      }
    }

    if (supabase) {
      await this.renderMedia();
    }

    fileInput.value = "";
  },

  // ===== MEDIA MODAL =====
  showMediaModal(index, mediaItems) {
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

    // Pokaż przycisk usuwania tylko gdy użytkownik jest adminem
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
        // Fetch the file
        const response = await fetch(url);
        const blob = await response.blob();

        // Create download link
        const downloadUrl = window.URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = downloadUrl;

        // Generate filename
        const fileName =
          mediaItem.file_path ||
          `media_${Date.now()}${mediaItem.type === "video" ? ".mp4" : ".jpg"}`;
        link.download = fileName.split("/").pop();

        // Trigger download
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        // Cleanup
        window.URL.revokeObjectURL(downloadUrl);

        console.log("✅ Pobrano plik:", link.download);
      } catch (error) {
        console.error("❌ Błąd podczas pobierania:", error);
        alert("Nie udało się pobrać pliku. Spróbuj ponownie.");
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

      if (supabase) {
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
      alert("Błąd podczas usuwania pliku: " + error.message);
    }
  },
};

// Initialize app when DOM is ready
document.addEventListener("DOMContentLoaded", () => {
  app.init();
});
