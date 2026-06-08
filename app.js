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

    document.getElementById('insert-p-btn').addEventListener('click', () => {
        insertBlockElement('<p>New paragraph here...</p>');
    });
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
                formatToolbar.classList.add('show');
                updateActiveFontButtonHighlight();
                return;
            }
        }
        formatToolbar.classList.remove('show');
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
        { id: 'btn-bold', cmd: 'bold' },
        { id: 'btn-italic', cmd: 'italic' },
        { id: 'btn-heading-1', cmd: 'formatBlock', val: 'H1' },
        { id: 'btn-heading-2', cmd: 'formatBlock', val: 'H2' },
        { id: 'btn-quote', cmd: 'formatBlock', val: 'blockquote' },
        { id: 'btn-ul', cmd: 'insertUnorderedList' },
        { id: 'btn-ol', cmd: 'insertOrderedList' }
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

    document.getElementById('editor-body').addEventListener('keydown', (e) => {
        if (e.key === 'Tab') {
            e.preventDefault();
            document.execCommand('insertHTML', false, '&#9;&#9;');
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
