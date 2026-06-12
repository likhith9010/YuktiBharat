// State Management and Global Configurations
let posts = [];
let currentPostId = null;
let saveTimeout = null;
let settings = {
    username: '',
    repo: '',
    branch: 'main',
    path: '',
    pat: ''
};

// API Base URL
const API_BASE = '/api/posts';

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
    loadSettings();
    initializeData();
    setupEventListeners();
    lucide.createIcons();
});

// Load Settings from LocalStorage
function loadSettings() {
    const savedSettings = localStorage.getItem('paperglass_settings');
    if (savedSettings) {
        settings = JSON.parse(savedSettings);
        // Fill settings form fields
        document.getElementById('github-username').value = settings.username || '';
        document.getElementById('github-repo').value = settings.repo || '';
        document.getElementById('github-branch').value = settings.branch || 'main';
        document.getElementById('github-path').value = settings.path || '';
        document.getElementById('github-pat').value = settings.pat || '';
    }
}

// Fetch Posts from Java Server API (or fall back to LocalStorage)
async function initializeData() {
    try {
        const res = await fetch(API_BASE);
        if (res.ok) {
            posts = await res.ok ? await res.json() : [];
            console.log('Loaded posts from Java Server API.');
        } else {
            throw new Error('Server returned error status');
        }
    } catch (err) {
        console.warn('Backend API unavailable. Falling back to LocalStorage:', err.message);
        const savedPosts = localStorage.getItem('paperglass_posts');
        if (savedPosts) {
            posts = JSON.parse(savedPosts);
        }
    }

    // Seed default welcome post if database is empty
    if (posts.length === 0) {
        const welcomePost = {
            id: 'welcome-to-paper-glass',
            title: 'Welcome to Paper-Glass Blog Editor',
            content: `<p>This is a beautiful, distraction-free environment to write, draft, and publish your thoughts directly to the web.</p>
<p>Blended with a physical warm paper background and sleek translucent glass panels, this UI helps you focus on what matters most: <b>writing</b>.</p>
<h2>Key Features</h2>
<ul>
<li><b>Live Auto-save</b>: No manual save button needed. Your work is saved locally as you type.</li>
<li><b>Rich Text Formatting</b>: Highlight any text to bring up the floating formatting toolbar, or use classic keyboard shortcuts (Ctrl+B, Ctrl+I).</li>
<li><b>Static Site Publishing</b>: Click "Publish" to generate static reader HTML pages dynamically.</li>
<li><b>Typography & Theme Controls</b>: Use the right sidebar toolbar to select fonts, insert info/warning callouts, or change the color tone of the paper sheet.</li>
</ul>
<blockquote>"The simplest way to write and publish from your browser."</blockquote>
<p>Feel free to edit this post, write a new one, or test your settings in the panel below!</p>`,
            status: 'draft',
            font: 'serif',
            theme: 'cream',
            createdAt: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
            updatedAt: new Date().toISOString()
        };
        posts.push(welcomePost);
        await savePostToServer(welcomePost);
    }

    // Sort by updated time, activate last updated post
    posts.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    currentPostId = posts[0].id;

    renderPostsList();
    loadPostIntoEditor(currentPostId);
}

// Render Left Sidebar Post List
function renderPostsList(filterText = '') {
    const postsListContainer = document.getElementById('posts-list');
    postsListContainer.innerHTML = '';

    const filteredPosts = posts.filter(post => 
        (post.title || '').toLowerCase().includes(filterText.toLowerCase()) || 
        (post.content || '').toLowerCase().includes(filterText.toLowerCase())
    );

    filteredPosts.forEach(post => {
        const isActive = post.id === currentPostId;
        const item = document.createElement('div');
        item.className = `p-3 rounded-xl border border-transparent cursor-pointer transition-all hover:bg-white/30 flex flex-col gap-1 relative ${isActive ? 'sidebar-item-active' : ''}`;
        item.dataset.id = post.id;
        
        const statusDotColor = post.status === 'published' ? 'bg-emerald-500' : 'bg-slate-400';

        item.innerHTML = `
            <div class="flex items-center justify-between gap-2">
                <span class="font-medium text-sm text-slate-800 truncate pr-2 w-full">${post.title || 'Untitled Post'}</span>
                <span class="w-2 h-2 rounded-full ${statusDotColor} flex-shrink-0" title="${post.status}"></span>
            </div>
            <div class="flex items-center justify-between text-[11px] text-slate-400 font-mono">
                <span>${post.createdAt}</span>
                <span>${countWords(post.content)} words</span>
            </div>
        `;

        item.addEventListener('click', () => {
            selectPost(post.id);
        });

        postsListContainer.appendChild(item);
    });

    document.getElementById('post-count').textContent = `${posts.length} Post${posts.length !== 1 ? 's' : ''}`;
}

// Load Post into Editor UI
function loadPostIntoEditor(postId) {
    const post = posts.find(p => p.id === postId);
    if (!post) return;

    currentPostId = postId;
    
    // Set Editor elements
    document.getElementById('editor-title').textContent = post.title || '';
    document.getElementById('editor-body').innerHTML = post.content || '';
    makeFiguresDraggable();
    document.getElementById('post-date').textContent = post.createdAt;
    
    // Theme selection applied locally to paper theme class
    
    // Set Paper Theme Class
    const theme = post.theme || 'cream';
    applyPaperTheme(theme);
    
    updateWordCountDisplay();
    updateSaveStatusIndicator(post.status, 'Saved');
    
    // Active left sidebar highlighting
    document.querySelectorAll('#posts-list > div').forEach(el => {
        if (el.dataset.id === postId) {
            el.classList.add('sidebar-item-active');
        } else {
            el.classList.remove('sidebar-item-active');
        }
    });
}

// Apply Selected Font to Selection
function applyFontToSelection(fontName) {
    document.getElementById('editor-body').focus();
    document.execCommand('fontName', false, fontName);
    updateActiveFontButtonHighlight();
    triggerAutosave();
}

// Dynamically highlight active typography button based on cursor/selection font
function updateActiveFontButtonHighlight() {
    const selection = window.getSelection();
    let fontName = 'Lora'; // Default base font
    
    if (selection.rangeCount > 0) {
        let node = selection.anchorNode;
        if (node) {
            if (node.nodeType === Node.TEXT_NODE) {
                node = node.parentNode;
            }
            const editorBody = document.getElementById('editor-body');
            while (node && node !== editorBody) {
                if (node.tagName === 'FONT') {
                    const face = node.getAttribute('face');
                    if (face) {
                        fontName = face;
                        break;
                    }
                }
                const style = node.getAttribute('style');
                if (style) {
                    if (style.includes('Lora')) { fontName = 'Lora'; break; }
                    if (style.includes('Outfit')) { fontName = 'Outfit'; break; }
                    if (style.includes('Caveat')) { fontName = 'Caveat'; break; }
                    if (style.includes('JetBrains Mono')) { fontName = 'JetBrains Mono'; break; }
                }
                node = node.parentNode;
            }
        }
    }

    let activeId = 'font-serif-btn';
    if (fontName === 'Outfit') activeId = 'font-sans-btn';
    else if (fontName === 'Caveat') activeId = 'font-hand-btn';
    else if (fontName === 'JetBrains Mono') activeId = 'font-mono-btn';

    // Update active tools buttons
    document.querySelectorAll('[id^="font-"][id$="-btn"]').forEach(btn => {
        if (btn.id === activeId) {
            btn.classList.add('active-tool-btn');
            btn.classList.replace('bg-white/20', 'bg-white/50');
            btn.classList.replace('border-transparent', 'border-slate-200');
        } else {
            btn.classList.remove('active-tool-btn');
            btn.classList.replace('bg-white/50', 'bg-white/20');
            btn.classList.replace('border-slate-200', 'border-transparent');
        }
    });
}

// Apply Selected Paper Theme to Editor Canvas
function applyPaperTheme(theme) {
    const paperSheet = document.getElementById('paper-sheet');
    paperSheet.className = paperSheet.className.replace(/theme-\w+/g, '').trim();
    paperSheet.classList.add(`theme-${theme}`);

    // Update active tools buttons
    document.querySelectorAll('[id^="theme-"][id$="-btn"]').forEach(btn => {
        if (btn.id === `theme-${theme}-btn`) {
            btn.classList.add('active-tool-btn');
            btn.classList.add('border-slate-200');
            btn.classList.replace('border-transparent', 'border-amber-200/80');
        } else {
            btn.classList.remove('active-tool-btn');
            btn.classList.remove('border-slate-200');
            btn.classList.replace('border-amber-200/80', 'border-transparent');
        }
    });
}

// Select a Post
function selectPost(postId) {
    if (saveTimeout) {
        clearTimeout(saveTimeout);
        savePostImmediately(false);
    }
    loadPostIntoEditor(postId);
}

// Trigger Auto-save
function triggerAutosave() {
    updateSaveStatusIndicator('saving', 'Saving...');
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
        savePostImmediately(false); // save silently in the background
    }, 800);
}

// Save Post Locally (API + LocalStorage backup)
async function savePostImmediately(showToastNotification = true) {
    const post = posts.find(p => p.id === currentPostId);
    if (!post) return;

    const newTitle = document.getElementById('editor-title').textContent.trim();
    const newContent = document.getElementById('editor-body').innerHTML;
    
    post.title = newTitle || 'Untitled Post';
    post.content = newContent;
    post.updatedAt = new Date().toISOString();

    // Regenerate slug if still a draft
    const formattedSlug = slugify(post.title);
    if (post.status === 'draft' && formattedSlug && formattedSlug !== post.id) {
        let slugCandidate = formattedSlug;
        let counter = 1;
        while (posts.some(p => p.id === slugCandidate && p !== post)) {
            slugCandidate = `${formattedSlug}-${counter++}`;
        }
        
        // If file saved in server, let server delete the old slug file first
        if (post.id !== slugCandidate) {
            deletePostOnServer(post.id);
        }

        post.id = slugCandidate;
        currentPostId = post.id;
    }

    // Save to LocalStorage Backup
    localStorage.setItem('paperglass_posts', JSON.stringify(posts));
    
    // Save to Local File System via Server API
    await savePostToServer(post);

    // Refresh Sidebar lists
    const filterText = document.getElementById('search-posts').value;
    renderPostsList(filterText);
    
    updateWordCountDisplay();
    updateSaveStatusIndicator(post.status, 'Saved');

    if (showToastNotification) {
        showToast('Draft saved successfully!');
    }
}

// API Call: Save to Server
async function savePostToServer(post) {
    try {
        await fetch(`${API_BASE}/${post.id}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(post)
        });
    } catch (err) {
        console.warn('Could not save post to Server API:', err.message);
    }
}

// API Call: Delete from Server
async function deletePostOnServer(postId) {
    try {
        await fetch(`${API_BASE}/${postId}`, {
            method: 'DELETE'
        });
    } catch (err) {
        console.warn('Could not delete post from Server API:', err.message);
    }
}

// Update Save Status Indicator Text
function updateSaveStatusIndicator(status, customText = '') {
    const statusDot = document.getElementById('status-dot');
    const statusText = document.getElementById('status-text');

    statusDot.className = 'w-1.5 h-1.5 rounded-full inline-block ';
    
    if (status === 'saving') {
        statusDot.classList.add('bg-amber-400', 'animate-pulse');
        statusText.textContent = customText || 'Saving...';
    } else if (status === 'published') {
        statusDot.classList.add('bg-emerald-500');
        statusText.textContent = 'Published';
    } else {
        statusDot.classList.add('bg-slate-400');
        statusText.textContent = customText || 'Draft';
    }
}

// Update Word Count Display
function updateWordCountDisplay() {
    const text = document.getElementById('editor-body').textContent || '';
    const words = countWords(text);
    document.getElementById('word-count').textContent = `${words} word${words !== 1 ? 's' : ''}`;
}

// Helper to Count Words
function countWords(str) {
    const cleanStr = str.replace(/<[^>]*>/g, ' ').trim();
    if (!cleanStr) return 0;
    return cleanStr.split(/\s+/).filter(word => word.length > 0).length;
}

// Helper to Slugify text
function slugify(text) {
    return text
        .toString()
        .toLowerCase()
        .trim()
        .replace(/\s+/g, '-')
        .replace(/[^\w\-]+/g, '')
        .replace(/\-\-+/g, '-')
        .replace(/^-+/, '')
        .replace(/-+$/, '');
}

// Configure Event Listeners
function setupEventListeners() {
    // Left Sidebar Toggle
    const sidebar = document.getElementById('sidebar');
    const toggleSidebarBtn = document.getElementById('toggle-sidebar-btn');
    const floatingMenuBtn = document.getElementById('floating-menu-btn');
    const headerSpacer = document.getElementById('header-spacer');
    const headerBrand = document.getElementById('header-brand');

    function toggleSidebar() {
        sidebar.classList.toggle('collapsed');
        const isClosed = sidebar.classList.contains('collapsed');
        if (isClosed) {
            floatingMenuBtn.classList.remove('hidden');
            headerSpacer.className = 'w-12';
            if (headerBrand) {
                headerBrand.classList.remove('opacity-0', 'w-0');
                headerBrand.classList.add('opacity-100', 'w-auto');
            }
        } else {
            floatingMenuBtn.classList.add('hidden');
            headerSpacer.className = 'w-0';
            if (headerBrand) {
                headerBrand.classList.remove('opacity-100', 'w-auto');
                headerBrand.classList.add('opacity-0', 'w-0');
            }
        }
    }

    toggleSidebarBtn.addEventListener('click', toggleSidebar);
    floatingMenuBtn.addEventListener('click', toggleSidebar);

    // Search bar filter
    document.getElementById('search-posts').addEventListener('input', (e) => {
        renderPostsList(e.target.value);
    });

    // Create New Post
    document.getElementById('new-post-btn').addEventListener('click', async () => {
        const newPost = {
            id: 'untitled-post-' + Date.now(),
            title: '',
            content: '<p></p>',
            status: 'draft',
            font: 'serif',
            theme: 'cream',
            createdAt: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
            updatedAt: new Date().toISOString()
        };
        posts.unshift(newPost);
        
        // Save locally immediately
        localStorage.setItem('paperglass_posts', JSON.stringify(posts));
        await savePostToServer(newPost);
        
        currentPostId = newPost.id;
        renderPostsList();
        loadPostIntoEditor(newPost.id);
        
        document.getElementById('editor-title').focus();
    });

    // Save and Sync typing inside Title and Body
    document.getElementById('editor-title').addEventListener('input', () => {
        triggerAutosave();
        updateWordCountDisplay();
    });
    document.getElementById('editor-body').addEventListener('input', () => {
        triggerAutosave();
        updateWordCountDisplay();
    });

    // Typography Buttons listeners (Right Toolbar)
    document.getElementById('font-serif-btn').addEventListener('mousedown', (e) => {
        e.preventDefault();
        applyFontToSelection('Lora');
    });
    document.getElementById('font-sans-btn').addEventListener('mousedown', (e) => {
        e.preventDefault();
        applyFontToSelection('Outfit');
    });
    document.getElementById('font-hand-btn').addEventListener('mousedown', (e) => {
        e.preventDefault();
        applyFontToSelection('Caveat');
    });
    document.getElementById('font-mono-btn').addEventListener('mousedown', (e) => {
        e.preventDefault();
        applyFontToSelection('JetBrains Mono');
    });

    // Paper Theme Buttons listeners (Right Toolbar)
    const themes = ['cream', 'yellow', 'green', 'white'];
    themes.forEach(theme => {
        const btn = document.getElementById(`theme-${theme}-btn`);
        if (btn) {
            btn.addEventListener('click', () => {
                const post = posts.find(p => p.id === currentPostId);
                if (post) {
                    post.theme = theme;
                    applyPaperTheme(theme);
                    triggerAutosave();
                }
            });
        }
    });

    // Block elements Insertion (Right Toolbar)
    function insertBlockElement(htmlString) {
        document.getElementById('editor-body').focus();
        document.execCommand('insertHTML', false, htmlString);
        triggerAutosave();
    }

    document.getElementById('insert-h2-btn').addEventListener('click', () => {
        insertBlockElement('<h2>Section Subtitle</h2><p></p>');
    });
    document.getElementById('insert-quote-btn').addEventListener('click', () => {
        insertBlockElement('<blockquote>"Insert a literary quote block here."</blockquote><p></p>');
    });
    document.getElementById('insert-info-btn').addEventListener('click', () => {
        insertBlockElement('<div class="callout-box callout-info" contenteditable="true"><b>Note:</b> Helpful highlight text inside blue glass card.</div><p></p>');
    });
    document.getElementById('insert-warn-btn').addEventListener('click', () => {
        insertBlockElement('<div class="callout-box callout-warn" contenteditable="true"><b>Caution:</b> Important alert content inside yellow glass card.</div><p></p>');
    });
    document.getElementById('insert-code-btn').addEventListener('click', () => {
        insertBlockElement('<pre><code>// Enter code here\nconsole.log("Paper-Glass Editor!");</code></pre><p></p>');
    });

    // ── Image Insert Modal ─────────────────────────────────
    const imageModal   = document.getElementById('image-modal');
    const imgFileInput = document.getElementById('img-file-input');
    const imgUrlInput  = document.getElementById('img-url-input');
    const imgAltInput  = document.getElementById('img-alt-input');

    // Size controls references
    const imgPreviewContainer = document.getElementById('img-preview-container');
    const imgPreview          = document.getElementById('img-preview');
    const imgWidthPreviewVal  = document.getElementById('img-width-preview-val');
    const imgWidthSlider      = document.getElementById('img-width-slider');
    const imgWidthLabel       = document.getElementById('img-width-label');
    const imgSizePresets      = document.querySelectorAll('.img-size-preset');

    let _savedRange    = null;

    function openImageModal() {
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0) _savedRange = sel.getRangeAt(0).cloneRange();
        imgFileInput.value = '';
        imgUrlInput.value  = '';
        imgAltInput.value  = '';

        // Reset slider and preview state
        imgWidthSlider.value = '100';
        imgWidthLabel.textContent = '100%';
        imgWidthPreviewVal.textContent = '100';
        imgPreviewContainer.classList.add('hidden');
        imgPreview.src = '';
        imgPreview.style.width = '100%';

        imageModal.classList.remove('hidden');
        lucide.createIcons();
    }
    function closeImageModal() {
        imageModal.classList.add('hidden');
    }

    function updateImagePreview(src) {
        if (src) {
            imgPreview.src = src;
            imgPreviewContainer.classList.remove('hidden');
            imgPreview.style.width = imgWidthSlider.value + '%';
        } else {
            imgPreviewContainer.classList.add('hidden');
            imgPreview.src = '';
        }
    }

    function doInsertImage(src) {
        if (!src) return;
        const alt = imgAltInput.value.trim() || 'Image';
        const width = imgWidthSlider.value;
        const imgHtml = `<figure draggable="true" style="margin:16px 0;text-align:center;"><img src="${src}" alt="${alt}" style="width:${width}%;max-width:100%;border-radius:10px;box-shadow:0 2px 16px rgba(0,0,0,.10);display:inline-block;"><figcaption style="font-size:.82em;color:#94a3b8;margin-top:6px;">${alt}</figcaption></figure><p></p>`;
        const editorBody = document.getElementById('editor-body');
        editorBody.focus();
        
        let targetRange = null;
        if (_savedRange) {
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(_savedRange);
            targetRange = _savedRange;
        }

        insertHtmlAtRange(imgHtml, targetRange);
        makeFiguresDraggable();
        triggerAutosave();
        closeImageModal();
    }

    document.getElementById('insert-image-btn').addEventListener('click', openImageModal);
    document.getElementById('close-image-modal').addEventListener('click', closeImageModal);
    document.getElementById('cancel-image-btn').addEventListener('click', closeImageModal);
    imageModal.addEventListener('click', (e) => { if (e.target === imageModal) closeImageModal(); });

    imgFileInput.addEventListener('change', () => {
        const file = imgFileInput.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            imgUrlInput.value = ev.target.result;
            updateImagePreview(ev.target.result);
        };
        reader.readAsDataURL(file);
    });

    imgUrlInput.addEventListener('input', () => {
        updateImagePreview(imgUrlInput.value.trim());
    });

    imgWidthSlider.addEventListener('input', () => {
        const val = imgWidthSlider.value;
        imgWidthLabel.textContent = val + '%';
        imgWidthPreviewVal.textContent = val;
        imgPreview.style.width = val + '%';
    });

    imgSizePresets.forEach(preset => {
        preset.addEventListener('click', (e) => {
            e.preventDefault();
            const percent = preset.dataset.percent;
            imgWidthSlider.value = percent;
            imgWidthLabel.textContent = percent + '%';
            imgWidthPreviewVal.textContent = percent;
            imgPreview.style.width = percent + '%';
        });
    });

    document.getElementById('confirm-image-btn').addEventListener('click', () => {
        const src = imgUrlInput.value.trim();
        if (!src) { showToast('Please select or paste an image source.', 'error'); return; }
        doInsertImage(src);
    });


    // Settings Modal open/close
    const settingsBtn = document.getElementById('settings-btn');
    const settingsModal = document.getElementById('settings-modal');
    const closeSettingsBtn = document.getElementById('close-settings-btn');

    settingsBtn.addEventListener('click', () => {
        settingsModal.classList.remove('hidden');
        setTimeout(() => {
            settingsModal.classList.remove('opacity-0');
            settingsModal.firstElementChild.classList.remove('scale-95');
        }, 10);
    });

    function closeSettings() {
        settingsModal.classList.add('opacity-0');
        settingsModal.firstElementChild.classList.add('scale-95');
        setTimeout(() => {
            settingsModal.classList.add('hidden');
        }, 300);
    }

    closeSettingsBtn.addEventListener('click', closeSettings);
    settingsModal.addEventListener('click', (e) => {
        if (e.target === settingsModal) closeSettings();
    });

    // Settings Form Save
    document.getElementById('settings-form').addEventListener('submit', (e) => {
        e.preventDefault();
        settings.username = document.getElementById('github-username').value.trim();
        settings.repo = document.getElementById('github-repo').value.trim();
        settings.branch = document.getElementById('github-branch').value.trim() || 'main';
        settings.path = document.getElementById('github-path').value.trim();
        settings.pat = document.getElementById('github-pat').value.trim();

        if (settings.path && !settings.path.endsWith('/')) {
            settings.path += '/';
        }
        if (settings.path && settings.path.startsWith('/')) {
            settings.path = settings.path.substring(1);
        }

        localStorage.setItem('paperglass_settings', JSON.stringify(settings));
        showToast('Settings saved successfully!');
        closeSettings();
    });

    // Test connection
    document.getElementById('test-connection-btn').addEventListener('click', async () => {
        const username = document.getElementById('github-username').value.trim();
        const repo = document.getElementById('github-repo').value.trim();
        const pat = document.getElementById('github-pat').value.trim();
        const branch = document.getElementById('github-branch').value.trim() || 'main';

        if (!username || !repo || !pat) {
            showToast('Please fill Username, Repository, and Token.', 'error');
            return;
        }

        const testBtn = document.getElementById('test-connection-btn');
        const originalText = testBtn.textContent;
        testBtn.textContent = 'Testing...';
        testBtn.disabled = true;

        try {
            const response = await fetch(`https://api.github.com/repos/${username}/${repo}/branches/${branch}`, {
                headers: {
                    'Authorization': `token ${pat}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            });

            if (response.ok) {
                showToast('GitHub Connection Successful!', 'success');
            } else {
                const errData = await response.json();
                showToast(`Failed: ${errData.message || response.statusText}`, 'error');
            }
        } catch (err) {
            showToast(`Error connecting to GitHub: ${err.message}`, 'error');
        } finally {
            testBtn.textContent = originalText;
            testBtn.disabled = false;
        }
    });

    // Delete Post Action
    document.getElementById('delete-post-btn').addEventListener('click', async () => {
        if (posts.length <= 1) {
            showToast('Cannot delete the last remaining post.', 'error');
            return;
        }

        if (confirm('Are you sure you want to delete this post? This cannot be undone.')) {
            const index = posts.findIndex(p => p.id === currentPostId);
            const deletedId = currentPostId;
            
            posts.splice(index, 1);
            localStorage.setItem('paperglass_posts', JSON.stringify(posts));
            
            // Delete file on local disk via API
            await deletePostOnServer(deletedId);
            
            showToast('Post deleted.');
            
            // Set active to first available
            currentPostId = posts[0].id;
            renderPostsList();
            loadPostIntoEditor(currentPostId);
        }
    });

    // Explicit Save Button Action
    const saveBtn = document.getElementById('save-btn');
    if (saveBtn) {
        saveBtn.addEventListener('click', () => {
            savePostImmediately(true);
        });
    }

    // Download Markdown File
    document.getElementById('download-md-btn').addEventListener('click', () => {
        const post = posts.find(p => p.id === currentPostId);
        if (!post) return;

        const markdownContent = buildMarkdownFile(post);
        const blob = new Blob([markdownContent], { type: 'text/markdown;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `${post.id}.md`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        showToast('Markdown exported successfully!');
    });

    // Publish Button (Static compiler via Java server API)
    document.getElementById('publish-btn').addEventListener('click', async () => {
        const post = posts.find(p => p.id === currentPostId);
        if (!post) return;

        // Force save current edits as draft fields first
        await savePostImmediately(false);

        const publishBtn = document.getElementById('publish-btn');
        const publishBtnText = publishBtn.querySelector('span');
        const originalText = publishBtnText.textContent;
        
        publishBtnText.textContent = 'Publishing...';
        publishBtn.disabled = true;

        try {
            // Update post status and copy draft fields to public published fields
            post.status = 'published';
            post.publishedTitle = post.title;
            post.publishedContent = post.content;
            post.publishedFont = post.font;
            post.publishedTheme = post.theme;

            localStorage.setItem('paperglass_posts', JSON.stringify(posts));
            await savePostToServer(post);

            // Call server publication API to compile index.html and static reader HTML
            const res = await fetch(`${API_BASE}/${post.id}/publish`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(post)
            });

            if (res.ok) {
                updateSaveStatusIndicator('published');
                renderPostsList();
                showToast('Static page published successfully!', 'success');
            } else {
                showToast('Failed to compile static files on Server API', 'error');
            }

            // Optional: If GitHub PAT settings are filled, we can also push to GitHub Pages!
            if (settings.username && settings.repo && settings.pat) {
                console.log('GitHub Publishing configured. Uploading Markdown to GitHub...');
                await pushToGitHub(post);
            }

        } catch (err) {
            showToast(`Error publishing: ${err.message}`, 'error');
        } finally {
            publishBtnText.textContent = originalText;
            publishBtn.disabled = false;
        }
    });

    // Push Markdown to GitHub repository (Fallback/Bonus CMS function)
    async function pushToGitHub(post) {
        try {
            const markdownContent = buildMarkdownFile(post);
            const contentBase64 = btoa(unescape(encodeURIComponent(markdownContent)));
            
            const filePath = `${settings.path || ''}${post.id}.md`;
            const url = `https://api.github.com/repos/${settings.username}/${settings.repo}/contents/${filePath}`;
            
            let sha = null;
            const checkRes = await fetch(`${url}?ref=${settings.branch}`, {
                headers: {
                    'Authorization': `token ${settings.pat}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            });

            if (checkRes.status === 200) {
                const fileInfo = await checkRes.json();
                sha = fileInfo.sha;
            }

            const putBody = {
                message: `Publish post: ${post.title}`,
                content: contentBase64,
                branch: settings.branch
            };
            if (sha) putBody.sha = sha;

            const res = await fetch(url, {
                method: 'PUT',
                headers: {
                    'Authorization': `token ${settings.pat}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/vnd.github.v3+json'
                },
                body: JSON.stringify(putBody)
            });

            if (res.ok) {
                showToast('Post pushed to GitHub Pages repository!', 'success');
            } else {
                console.warn('GitHub push failed. Local publish was successful.');
            }
        } catch (e) {
            console.error('Error syncing to GitHub repository:', e);
        }
    }

    // Formatting Toolbar controls
    const formatToolbar = document.getElementById('format-toolbar');
    
    document.addEventListener('selectionchange', () => {
        const selection = window.getSelection();
        const editorBody = document.getElementById('editor-body');

        if (selection.rangeCount > 0 && !selection.isCollapsed) {
            const range = selection.getRangeAt(0);
            
            if (editorBody.contains(range.commonAncestorContainer)) {
                const rect = range.getBoundingClientRect();
                
                formatToolbar.style.top = `${rect.top + window.scrollY - 10}px`;
                formatToolbar.style.left = `${rect.left + window.scrollX + (rect.width / 2)}px`;
                formatToolbar.classList.remove('hidden');
                updateActiveFontButtonHighlight();
                return;
            }
        }
        formatToolbar.classList.add('hidden');
        if (selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            if (editorBody.contains(range.commonAncestorContainer)) {
                updateActiveFontButtonHighlight();
            }
        }
    });

    function applyFormat(command, value = null) {
        document.execCommand(command, false, value);
        document.getElementById('editor-body').focus();
        triggerAutosave();
    }

    const toolbarButtons = [
        { id: 'btn-bold',         cmd: 'bold' },
        { id: 'btn-italic',       cmd: 'italic' },
        { id: 'btn-heading-1',    cmd: 'formatBlock', val: 'H1' },
        { id: 'btn-heading-2',    cmd: 'formatBlock', val: 'H2' },
        { id: 'btn-quote',        cmd: 'formatBlock', val: 'blockquote' },
        { id: 'btn-ul',           cmd: 'insertUnorderedList' },
        { id: 'btn-ol',           cmd: 'insertOrderedList' },
        { id: 'btn-align-left',   cmd: 'justifyLeft' },
        { id: 'btn-align-center', cmd: 'justifyCenter' },
        { id: 'btn-align-right',  cmd: 'justifyRight' },
        { id: 'btn-align-justify',cmd: 'justifyFull' }
    ];

    toolbarButtons.forEach(btn => {
        const el = document.getElementById(btn.id);
        if (el) {
            el.addEventListener('mousedown', (e) => {
                e.preventDefault();
                applyFormat(btn.cmd, btn.val || null);
            });
        }
    });

    // Sidebar Alignment Buttons
    const sidebarAlignButtons = [
        { id: 'sidebar-align-left',    cmd: 'justifyLeft' },
        { id: 'sidebar-align-center',  cmd: 'justifyCenter' },
        { id: 'sidebar-align-right',   cmd: 'justifyRight' },
        { id: 'sidebar-align-justify', cmd: 'justifyFull' }
    ];
    sidebarAlignButtons.forEach(btn => {
        const el = document.getElementById(btn.id);
        if (el) {
            el.addEventListener('mousedown', (e) => {
                e.preventDefault();
                applyFormat(btn.cmd);
            });
        }
    });

    // ── Highlighter Button ──────────────────────────────────────────
    const highlightPicker = document.getElementById('highlight-picker');
    const btnHighlight    = document.getElementById('btn-highlight');

    btnHighlight.addEventListener('mousedown', (e) => {
        e.preventDefault();
        highlightPicker.classList.toggle('hidden');
    });

    document.querySelectorAll('.hl-swatch').forEach(swatch => {
        swatch.addEventListener('mousedown', (e) => {
            e.preventDefault();
            const color = swatch.dataset.hl;
            if (color === 'none') {
                document.execCommand('hiliteColor', false, 'transparent');
            } else {
                document.execCommand('hiliteColor', false, color);
            }
            document.getElementById('editor-body').focus();
            triggerAutosave();
            highlightPicker.classList.add('hidden');
        });
    });

    document.addEventListener('mousedown', (e) => {
        const wrap = document.getElementById('highlighter-wrap');
        if (wrap && !wrap.contains(e.target)) {
            highlightPicker.classList.add('hidden');
        }
    });

    // ── Pencil Canvas Drawing Tool ─────────────────────────────────
    const pencilCanvas    = document.getElementById('pencil-canvas');
    const pencilCtx       = pencilCanvas.getContext('2d');
    const pencilToggleBtn = document.getElementById('pencil-toggle-btn');
    const pencilLabel     = document.getElementById('pencil-btn-label');
    const pencilSizeInput = document.getElementById('pencil-size');
    const paperSheet      = document.getElementById('paper-sheet');
    const pencilCursor    = document.getElementById('pencil-cursor');
    let pencilActive  = false;
    let pencilDrawing = false;
    let pencilColor   = '#1e293b';
    let pencilSize    = 3;
    let isEraserActive = false;

    function resizePencilCanvas() {
        const rect = paperSheet.getBoundingClientRect();
        const dpr  = window.devicePixelRatio || 1;
        const tmpC = document.createElement('canvas');
        tmpC.width  = pencilCanvas.width;
        tmpC.height = pencilCanvas.height;
        tmpC.getContext('2d').drawImage(pencilCanvas, 0, 0);
        pencilCanvas.width  = Math.floor(rect.width  * dpr);
        pencilCanvas.height = Math.floor(rect.height * dpr);
        pencilCanvas.style.width  = rect.width  + 'px';
        pencilCanvas.style.height = rect.height + 'px';
        pencilCtx.scale(dpr, dpr);
        pencilCtx.drawImage(tmpC, 0, 0, rect.width, rect.height);
        pencilCtx.lineCap  = 'round';
        pencilCtx.lineJoin = 'round';
    }
    resizePencilCanvas();
    window.addEventListener('resize', resizePencilCanvas);

    pencilToggleBtn.addEventListener('click', () => {
        pencilActive = !pencilActive;
        if (pencilActive) {
            pencilCanvas.style.pointerEvents = 'auto';
            pencilCanvas.style.cursor = isEraserActive ? 'none' : 'crosshair';
            document.getElementById('editor-body').style.pointerEvents = 'none';
            pencilToggleBtn.style.background = 'rgba(30,41,59,0.85)';
            pencilToggleBtn.style.color = '#fff';
            pencilLabel.textContent = 'Disable Pencil';
        } else {
            pencilCanvas.style.pointerEvents = 'none';
            pencilCanvas.style.cursor = 'default';
            document.getElementById('editor-body').style.pointerEvents = '';
            pencilToggleBtn.style.background = '';
            pencilToggleBtn.style.color = '';
            pencilLabel.textContent = 'Enable Pencil';
            pencilCursor.style.display = 'none';
        }
    });

    document.querySelectorAll('.pencil-color-swatch').forEach(swatch => {
        swatch.addEventListener('click', () => {
            pencilColor = swatch.dataset.color;
            isEraserActive = false;

            document.querySelectorAll('.pencil-color-swatch').forEach(s => {
                s.style.outline = '';
                s.style.outlineOffset = '';
            });
            const eraserBtn = document.getElementById('pencil-eraser-btn');
            if (eraserBtn) {
                eraserBtn.style.outline = '';
                eraserBtn.style.outlineOffset = '';
            }

            swatch.style.outline = '3px solid #1e293b';
            swatch.style.outlineOffset = '2px';

            pencilCursor.style.display = 'none';
            if (pencilActive) {
                pencilCanvas.style.cursor = 'crosshair';
            }
        });
    });
    // Mark first swatch active by default
    const firstSwatch = document.querySelector('.pencil-color-swatch');
    if (firstSwatch) { firstSwatch.style.outline = '3px solid #1e293b'; firstSwatch.style.outlineOffset = '2px'; }

    const pencilEraserBtn = document.getElementById('pencil-eraser-btn');
    if (pencilEraserBtn) {
        pencilEraserBtn.addEventListener('click', () => {
            isEraserActive = true;

            document.querySelectorAll('.pencil-color-swatch').forEach(s => {
                s.style.outline = '';
                s.style.outlineOffset = '';
            });
            pencilEraserBtn.style.outline = '3px solid #1e293b';
            pencilEraserBtn.style.outlineOffset = '2px';

            if (pencilActive) {
                pencilCanvas.style.cursor = 'none';
            }
        });
    }

    document.getElementById('pencil-clear-btn').addEventListener('click', () => {
        pencilCtx.clearRect(0, 0, pencilCanvas.width, pencilCanvas.height);
    });

    pencilSizeInput.addEventListener('input', () => {
        pencilSize = parseInt(pencilSizeInput.value, 10);
        if (isEraserActive && pencilActive) {
            const size = pencilSize * 2;
            pencilCursor.style.width = size + 'px';
            pencilCursor.style.height = size + 'px';
        }
    });

    function getPencilPos(e) {
        const rect = pencilCanvas.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        return { x: clientX - rect.left, y: clientY - rect.top };
    }

    function updateEraserCursor(pos) {
        if (pencilActive && isEraserActive && pos) {
            const size = pencilSize * 2;
            pencilCursor.style.display = 'block';
            pencilCursor.style.width = size + 'px';
            pencilCursor.style.height = size + 'px';
            pencilCursor.style.left = (pos.x - size / 2) + 'px';
            pencilCursor.style.top = (pos.y - size / 2) + 'px';
        } else {
            pencilCursor.style.display = 'none';
        }
    }

    pencilCanvas.addEventListener('mousedown', (e) => {
        if (!pencilActive) return;
        pencilDrawing = true;
        const pos = getPencilPos(e);
        if (isEraserActive) {
            const size = pencilSize * 2;
            pencilCtx.clearRect(pos.x - size / 2, pos.y - size / 2, size, size);
            updateEraserCursor(pos);
        } else {
            pencilCtx.beginPath();
            pencilCtx.moveTo(pos.x, pos.y);
            pencilCtx.strokeStyle = pencilColor;
            pencilCtx.lineWidth   = pencilSize;
            pencilCtx.lineCap     = 'round';
            pencilCtx.lineJoin    = 'round';
        }
    });
    pencilCanvas.addEventListener('mousemove', (e) => {
        if (!pencilActive) return;
        const pos = getPencilPos(e);
        if (isEraserActive) {
            updateEraserCursor(pos);
            if (pencilDrawing) {
                const size = pencilSize * 2;
                pencilCtx.clearRect(pos.x - size / 2, pos.y - size / 2, size, size);
            }
        } else {
            pencilCursor.style.display = 'none';
            if (pencilDrawing) {
                pencilCtx.lineTo(pos.x, pos.y);
                pencilCtx.stroke();
            }
        }
    });
    pencilCanvas.addEventListener('mouseup',    () => { pencilDrawing = false; });
    pencilCanvas.addEventListener('mouseleave', () => { 
        pencilDrawing = false; 
        pencilCursor.style.display = 'none';
    });
    pencilCanvas.addEventListener('mouseenter', (e) => {
        if (pencilActive && isEraserActive) {
            const pos = getPencilPos(e);
            updateEraserCursor(pos);
        }
    });
    pencilCanvas.addEventListener('touchstart', (e) => {
        if (!pencilActive) return;
        e.preventDefault();
        pencilDrawing = true;
        const pos = getPencilPos(e);
        if (isEraserActive) {
            const size = pencilSize * 2;
            pencilCtx.clearRect(pos.x - size / 2, pos.y - size / 2, size, size);
        } else {
            pencilCtx.beginPath();
            pencilCtx.moveTo(pos.x, pos.y);
            pencilCtx.strokeStyle = pencilColor;
            pencilCtx.lineWidth   = pencilSize;
        }
    }, { passive: false });
    pencilCanvas.addEventListener('touchmove', (e) => {
        if (!pencilActive || !pencilDrawing) return;
        e.preventDefault();
        const pos = getPencilPos(e);
        if (isEraserActive) {
            const size = pencilSize * 2;
            pencilCtx.clearRect(pos.x - size / 2, pos.y - size / 2, size, size);
        } else {
            pencilCtx.lineTo(pos.x, pos.y);
            pencilCtx.stroke();
        }
    }, { passive: false });
    pencilCanvas.addEventListener('touchend', () => { pencilDrawing = false; });

    document.getElementById('editor-body').addEventListener('keydown', (e) => {
        if (e.key === 'Tab') {
            e.preventDefault();
            document.execCommand('insertHTML', false, '&#9;&#9;');
        }
    });

    // ── Image Drag-and-Drop & Action Toolbar ──────────────────────────────
    let draggedElement = null;
    let dropIndicator = null;
    let activeFormatFigure = null;

    function createDropIndicator() {
        if (!dropIndicator) {
            dropIndicator = document.createElement('div');
            dropIndicator.id = 'editor-drop-indicator';
            dropIndicator.style.width = '100%';
            dropIndicator.style.height = '4px';
            dropIndicator.style.backgroundColor = '#8b5cf6'; // Violet-500
            dropIndicator.style.borderRadius = '2px';
            dropIndicator.style.margin = '12px 0';
            dropIndicator.style.transition = 'all 0.15s ease-in-out';
            dropIndicator.setAttribute('contenteditable', 'false');
        }
        return dropIndicator;
    }

    const editorBody = document.getElementById('editor-body');

    // Drag-and-drop mechanics
    editorBody.addEventListener('dragstart', (e) => {
        const figure = e.target.closest('figure');
        if (figure) {
            draggedElement = figure;
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', 'dragged-figure');

            // Lightweight SVG drag icon to bypass base64 rendering lag
            try {
                const dragIcon = new Image();
                dragIcon.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="%238b5cf6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>';
                e.dataTransfer.setDragImage(dragIcon, 24, 24);
            } catch (err) {
                console.error('Failed to set drag image:', err);
            }

            setTimeout(() => {
                figure.style.opacity = '0.4';
            }, 0);
            
            // Hide formatting toolbar during drag
            const imgToolbar = document.getElementById('image-action-toolbar');
            if (imgToolbar) imgToolbar.classList.add('hidden');
        }
    });

    editorBody.addEventListener('dragend', (e) => {
        if (draggedElement) {
            draggedElement.style.opacity = '1';
        }
        if (dropIndicator && dropIndicator.parentNode) {
            dropIndicator.parentNode.removeChild(dropIndicator);
        }
        draggedElement = null;
    });

    editorBody.addEventListener('dragover', (e) => {
        if (!draggedElement) return;
        e.preventDefault();

        let target = e.target;
        if (target === editorBody) {
            const children = Array.from(editorBody.children).filter(c => c !== draggedElement && c !== dropIndicator);
            let closest = null;
            let closestOffset = Number.NEGATIVE_INFINITY;
            children.forEach(child => {
                const rect = child.getBoundingClientRect();
                const offset = e.clientY - (rect.top + rect.height / 2);
                if (offset < 0 && offset > closestOffset) {
                    closestOffset = offset;
                    closest = child;
                }
            });
            const indicator = createDropIndicator();
            if (closest) {
                editorBody.insertBefore(indicator, closest);
            } else {
                editorBody.appendChild(indicator);
            }
            return;
        }

        const block = target.closest('#editor-body > *');
        if (block && block !== draggedElement && block !== dropIndicator) {
            const rect = block.getBoundingClientRect();
            const relativeY = e.clientY - rect.top;
            const indicator = createDropIndicator();
            if (relativeY < rect.height / 2) {
                editorBody.insertBefore(indicator, block);
            } else {
                editorBody.insertBefore(indicator, block.nextSibling);
            }
        }
    });

    editorBody.addEventListener('drop', (e) => {
        if (!draggedElement) return;
        e.preventDefault();

        const indicator = createDropIndicator();
        if (indicator.parentNode) {
            indicator.parentNode.insertBefore(draggedElement, indicator);
            indicator.parentNode.removeChild(indicator);
        }

        if (!draggedElement.nextSibling || draggedElement.nextSibling.tagName === 'FIGURE') {
            const p = document.createElement('p');
            p.innerHTML = '<br>';
            draggedElement.parentNode.insertBefore(p, draggedElement.nextSibling);
        }

        triggerAutosave();
    });

    // Image clicked event to trigger floating toolbar
    editorBody.addEventListener('click', (e) => {
        const figure = e.target.closest('figure');
        const isImg = e.target.tagName === 'IMG';
        
        if (figure || isImg) {
            activeFormatFigure = figure || e.target.closest('figure');
            if (activeFormatFigure) {
                positionImageToolbar(activeFormatFigure);
                const imgToolbar = document.getElementById('image-action-toolbar');
                imgToolbar.classList.remove('hidden');
                
                // Hide normal text floating toolbar to avoid overlapping
                const formatToolbar = document.getElementById('format-toolbar');
                if (formatToolbar) formatToolbar.classList.add('hidden');
            }
        } else {
            const imgToolbar = document.getElementById('image-action-toolbar');
            if (imgToolbar && !imgToolbar.contains(e.target)) {
                imgToolbar.classList.add('hidden');
                activeFormatFigure = null;
            }
        }
    });

    // Position Image Toolbar above figure
    function positionImageToolbar(figure) {
        const imgToolbar = document.getElementById('image-action-toolbar');
        if (!figure || !imgToolbar) return;
        
        const rect = figure.getBoundingClientRect();
        imgToolbar.classList.remove('hidden');
        const tbRect = imgToolbar.getBoundingClientRect();
        
        let top = rect.top + window.scrollY - 48;
        let left = rect.left + window.scrollX + (rect.width - tbRect.width) / 2;
        
        if (top < window.scrollY + 10) {
            top = rect.bottom + window.scrollY + 10;
        }
        
        imgToolbar.style.top = top + 'px';
        imgToolbar.style.left = Math.max(10, left) + 'px';

        // Update active class on toolbar size buttons
        updateImageToolbarSizeActive(figure);
    }

    // Floating Image Toolbar Buttons Listeners
    document.getElementById('img-btn-move-up').addEventListener('mousedown', (e) => {
        e.preventDefault();
        if (!activeFormatFigure) return;
        const prev = activeFormatFigure.previousElementSibling;
        if (prev) {
            activeFormatFigure.parentNode.insertBefore(activeFormatFigure, prev);
            positionImageToolbar(activeFormatFigure);
            triggerAutosave();
        }
    });

    document.getElementById('img-btn-move-down').addEventListener('mousedown', (e) => {
        e.preventDefault();
        if (!activeFormatFigure) return;
        const next = activeFormatFigure.nextElementSibling;
        if (next) {
            activeFormatFigure.parentNode.insertBefore(activeFormatFigure, next.nextElementSibling);
            positionImageToolbar(activeFormatFigure);
            triggerAutosave();
        }
    });

    document.getElementById('img-btn-align-left').addEventListener('mousedown', (e) => {
        e.preventDefault();
        if (!activeFormatFigure) return;
        activeFormatFigure.style.textAlign = 'left';
        activeFormatFigure.style.margin = '16px auto 16px 0';
        triggerAutosave();
    });

    document.getElementById('img-btn-align-center').addEventListener('mousedown', (e) => {
        e.preventDefault();
        if (!activeFormatFigure) return;
        activeFormatFigure.style.textAlign = 'center';
        activeFormatFigure.style.margin = '16px auto';
        triggerAutosave();
    });

    document.getElementById('img-btn-align-right').addEventListener('mousedown', (e) => {
        e.preventDefault();
        if (!activeFormatFigure) return;
        activeFormatFigure.style.textAlign = 'right';
        activeFormatFigure.style.margin = '16px 0 16px auto';
        triggerAutosave();
    });

    document.getElementById('img-btn-delete').addEventListener('mousedown', (e) => {
        e.preventDefault();
        if (!activeFormatFigure) return;
        activeFormatFigure.parentNode.removeChild(activeFormatFigure);
        document.getElementById('image-action-toolbar').classList.add('hidden');
        activeFormatFigure = null;
        triggerAutosave();
    });

    // Toolbar size buttons
    document.querySelectorAll('.img-toolbar-size-btn').forEach(btn => {
        btn.addEventListener('mousedown', (e) => {
            e.preventDefault();
            if (!activeFormatFigure) return;
            const img = activeFormatFigure.querySelector('img');
            if (img) {
                const percent = btn.dataset.percent;
                img.style.width = percent + '%';
                updateImageToolbarSizeActive(activeFormatFigure);
                positionImageToolbar(activeFormatFigure);
                triggerAutosave();
            }
        });
    });

    // Handle clicks outside figure/toolbar
    document.addEventListener('mousedown', (e) => {
        const imgToolbar = document.getElementById('image-action-toolbar');
        if (imgToolbar && !imgToolbar.contains(e.target) && !e.target.closest('figure') && e.target.tagName !== 'IMG') {
            imgToolbar.classList.add('hidden');
            activeFormatFigure = null;
        }
    });

    window.addEventListener('resize', () => {
        if (activeFormatFigure) positionImageToolbar(activeFormatFigure);
    });

    window.addEventListener('scroll', () => {
        if (activeFormatFigure) positionImageToolbar(activeFormatFigure);
    });
}

// Helper to make existing figures draggable
function makeFiguresDraggable() {
    const editorBody = document.getElementById('editor-body');
    if (editorBody) {
        editorBody.querySelectorAll('figure').forEach(fig => {
            fig.setAttribute('draggable', 'true');
        });
    }
}

// Highlight the active size button in the toolbar
function updateImageToolbarSizeActive(figure) {
    if (!figure) return;
    const img = figure.querySelector('img');
    if (!img) return;

    let width = img.style.width || '100%';
    const percentVal = width.replace('%', '').trim();

    document.querySelectorAll('.img-toolbar-size-btn').forEach(btn => {
        const btnPercent = btn.dataset.percent;
        if (btnPercent === percentVal) {
            btn.classList.add('bg-white/30', 'text-white', 'font-extrabold');
            btn.classList.remove('text-slate-200');
        } else {
            btn.classList.remove('bg-white/30', 'text-white', 'font-extrabold');
            btn.classList.add('text-slate-200');
        }
    });
}

// Convert HTML content into structured Markdown with YAML Frontmatter
function buildMarkdownFile(post) {
    const yamlFrontmatter = `---
layout: post
title: "${post.title.replace(/"/g, '\\"')}"
date: ${new Date(post.updatedAt).toISOString().split('T')[0]}
status: ${post.status}
---

`;

    const markdownBody = convertHtmlToMarkdown(post.content);
    return yamlFrontmatter + markdownBody;
}

// Custom HTML to Markdown tags parser
function convertHtmlToMarkdown(htmlString) {
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = htmlString;

    let markdown = '';
    const children = tempDiv.childNodes;

    for (let i = 0; i < children.length; i++) {
        const node = children[i];
        if (node.nodeType === Node.TEXT_NODE) {
            markdown += node.textContent;
        } else if (node.nodeType === Node.ELEMENT_NODE) {
            const tagName = node.tagName.toLowerCase();
            const text = node.textContent.trim();
            
            if (!text && tagName !== 'br') continue;

            let htmlInner = node.innerHTML
                .replace(/<b>|<strong>/gi, '**')
                .replace(/<\/b>|<\/strong>/gi, '**')
                .replace(/<i>|<em>/gi, '*')
                .replace(/<\/i>|<\/em>/gi, '*')
                .replace(/<br\s*\/?>/gi, '\n');

            switch (tagName) {
                case 'p':
                    markdown += htmlInner + '\n\n';
                    break;
                case 'h1':
                    markdown += `# ${node.textContent.trim()}\n\n`;
                    break;
                case 'h2':
                    markdown += `## ${node.textContent.trim()}\n\n`;
                    break;
                case 'h3':
                    markdown += `### ${node.textContent.trim()}\n\n`;
                    break;
                case 'blockquote':
                    markdown += `> ${node.textContent.trim()}\n\n`;
                    break;
                case 'ul':
                    node.querySelectorAll('li').forEach(li => {
                        markdown += `- ${li.textContent.trim()}\n`;
                    });
                    markdown += '\n';
                    break;
                case 'ol':
                    let idx = 1;
                    node.querySelectorAll('li').forEach(li => {
                        markdown += `${idx++}. ${li.textContent.trim()}\n`;
                    });
                    markdown += '\n';
                    break;
                case 'br':
                    markdown += '\n';
                    break;
                default:
                    markdown += node.textContent + '\n';
            }
        }
    }
    return markdown.trim();
}

// Show toast notifications
function showToast(message, type = 'success') {
    const existingToast = document.querySelector('.toast-notification');
    if (existingToast) {
        existingToast.classList.remove('show');
        setTimeout(() => existingToast.remove(), 300);
    }

    const toast = document.createElement('div');
    toast.className = 'toast-notification';
    
    const iconName = type === 'success' ? 'check-circle' : 'alert-circle';
    const iconColor = type === 'success' ? 'text-emerald-500' : 'text-rose-500';

    toast.innerHTML = `
        <i data-lucide="${iconName}" class="w-5 h-5 ${iconColor}"></i>
        <span class="text-sm font-semibold text-slate-700">${message}</span>
    `;

    document.body.appendChild(toast);
    lucide.createIcons();

    setTimeout(() => {
        toast.classList.add('show');
    }, 50);

    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => {
            toast.remove();
        }, 300);
    }, 3500);
}

// Helper to insert HTML at a specific selection range
function insertHtmlAtRange(html, range) {
    const temp = document.createElement('div');
    temp.innerHTML = html.trim();
    const node = temp.firstChild;

    if (!range) {
        const editorBody = document.getElementById('editor-body');
        editorBody.appendChild(node);
        return node;
    }

    range.deleteContents();
    range.insertNode(node);

    // Position cursor after the inserted node
    const nextRange = document.createRange();
    nextRange.setStartAfter(node);
    nextRange.setEndAfter(node);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(nextRange);

    return node;
}
