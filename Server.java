import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import com.sun.net.httpserver.HttpServer;
import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;

public class Server {
    private static final Path DATA_DIR = Paths.get("./data");

    public static void main(String[] args) throws IOException {
        // Create storage directories
        if (!Files.exists(DATA_DIR)) {
            Files.createDirectories(DATA_DIR);
        }

        int port = 8000;
        HttpServer server = HttpServer.create(new InetSocketAddress(port), 0);

        // Context handlers
        server.createContext("/api/posts", new PostsApiHandler());
        server.createContext("/", new StaticFileHandler());

        server.setExecutor(null); // default executor
        System.out.println("YuktiBharat Blog Editor & Publisher is running!");
        System.out.println("Admin Editor:   http://localhost:" + port + "/editor.html");
        System.out.println("Public Site:    http://localhost:" + port + "/index.html");

        // Initial compilation of public site
        try {
            compilePublicIndex();
        } catch (Exception e) {
            System.err.println("Could not compile index on start: " + e.getMessage());
        }

        server.start();
    }

    // Static File Server
    static class StaticFileHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            String pathStr = exchange.getRequestURI().getPath();
            if (pathStr.equals("/")) {
                pathStr = "/index.html";
            }

            Path path = Paths.get("." + pathStr).normalize();
            Path currentDir = Paths.get(".").toAbsolutePath().normalize();
            Path absolutePath = path.toAbsolutePath().normalize();

            if (!absolutePath.startsWith(currentDir)) {
                sendError(exchange, 403, "Forbidden");
                return;
            }

            if (!Files.exists(path) || Files.isDirectory(path)) {
                sendError(exchange, 404, "File Not Found");
                return;
            }

            String contentType = "text/plain";
            String filename = path.getFileName().toString().toLowerCase();
            if (filename.endsWith(".html")) {
                contentType = "text/html; charset=utf-8";
            } else if (filename.endsWith(".css")) {
                contentType = "text/css; charset=utf-8";
            } else if (filename.endsWith(".js")) {
                contentType = "text/javascript; charset=utf-8";
            } else if (filename.endsWith(".png")) {
                contentType = "image/png";
            } else if (filename.endsWith(".jpg") || filename.endsWith(".jpeg")) {
                contentType = "image/jpeg";
            } else if (filename.endsWith(".svg")) {
                contentType = "image/svg+xml";
            }

            byte[] bytes = Files.readAllBytes(path);
            exchange.getResponseHeaders().set("Content-Type", contentType);
            exchange.sendResponseHeaders(200, bytes.length);
            try (OutputStream os = exchange.getResponseBody()) {
                os.write(bytes);
            }
        }

        private void sendError(HttpExchange exchange, int statusCode, String message) throws IOException {
            byte[] bytes = message.getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(statusCode, bytes.length);
            try (OutputStream os = exchange.getResponseBody()) {
                os.write(bytes);
            }
        }
    }

    // API Endpoint for /api/posts
    static class PostsApiHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            exchange.getResponseHeaders().set("Access-Control-Allow-Origin", "*");
            exchange.getResponseHeaders().set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
            exchange.getResponseHeaders().set("Access-Control-Allow-Headers", "Content-Type");

            String method = exchange.getRequestMethod();
            if (method.equalsIgnoreCase("OPTIONS")) {
                exchange.sendResponseHeaders(204, -1);
                return;
            }

            String path = exchange.getRequestURI().getPath();

            try {
                if (method.equalsIgnoreCase("GET")) {
                    handleGet(exchange, path);
                } else if (method.equalsIgnoreCase("POST")) {
                    handlePost(exchange, path);
                } else if (method.equalsIgnoreCase("DELETE")) {
                    handleDelete(exchange, path);
                } else {
                    sendResponse(exchange, 405, "Method Not Allowed");
                }
            } catch (Exception e) {
                e.printStackTrace();
                sendResponse(exchange, 500, "Internal Server Error: " + e.getMessage());
            }
        }

        private void handleGet(HttpExchange exchange, String path) throws IOException {
            String[] segments = path.split("/");
            if (segments.length > 3) {
                String id = segments[3];
                Path filePath = DATA_DIR.resolve(id + ".json");
                if (Files.exists(filePath)) {
                    byte[] bytes = Files.readAllBytes(filePath);
                    exchange.getResponseHeaders().set("Content-Type", "application/json");
                    sendResponseBytes(exchange, 200, bytes);
                } else {
                    sendResponse(exchange, 404, "Post not found");
                }
                return;
            }

            List<String> jsonList = new ArrayList<>();
            List<Path> files = Files.list(DATA_DIR)
                    .filter(p -> p.toString().endsWith(".json"))
                    .collect(Collectors.toList());

            for (Path file : files) {
                try {
                    String content = Files.readString(file, StandardCharsets.UTF_8);
                    jsonList.add(content);
                } catch (Exception e) {
                    // Skip corrupt files
                }
            }

            String responseJson = "[" + String.join(",", jsonList) + "]";
            exchange.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
            sendResponse(exchange, 200, responseJson);
        }

        private void handlePost(HttpExchange exchange, String path) throws IOException {
            String[] segments = path.split("/");
            if (segments.length < 4) {
                sendResponse(exchange, 400, "Bad Request: Missing Post ID");
                return;
            }

            String id = segments[3];
            boolean isPublish = segments.length > 4 && segments[4].equalsIgnoreCase("publish");

            String body = "";
            try (BufferedReader reader = new BufferedReader(
                    new InputStreamReader(exchange.getRequestBody(), StandardCharsets.UTF_8))) {
                body = reader.lines().collect(Collectors.joining("\n"));
            }

            Path filePath = DATA_DIR.resolve(id + ".json");
            Files.writeString(filePath, body, StandardCharsets.UTF_8);

            if (isPublish) {
                // Re-compile all static HTML files to update sidebars with correct links
                recompileAllStaticFiles();
            }

            sendResponse(exchange, 200, "{\"status\":\"success\"}");
        }

        private void handleDelete(HttpExchange exchange, String path) throws IOException {
            String[] segments = path.split("/");
            if (segments.length < 4) {
                sendResponse(exchange, 400, "Bad Request: Missing Post ID");
                return;
            }
            String id = segments[3];

            Path dataPath = DATA_DIR.resolve(id + ".json");
            if (Files.exists(dataPath)) {
                Files.delete(dataPath);
            }

            Path staticPage = Paths.get("./" + id + ".html");
            if (Files.exists(staticPage)) {
                Files.delete(staticPage);
            }

            recompileAllStaticFiles();
            sendResponse(exchange, 200, "{\"status\":\"success\"}");
        }

        private void sendResponse(HttpExchange exchange, int statusCode, String response) throws IOException {
            byte[] bytes = response.getBytes(StandardCharsets.UTF_8);
            sendResponseBytes(exchange, statusCode, bytes);
        }

        private void sendResponseBytes(HttpExchange exchange, int statusCode, byte[] bytes) throws IOException {
            exchange.sendResponseHeaders(statusCode, bytes.length);
            try (OutputStream os = exchange.getResponseBody()) {
                os.write(bytes);
            }
        }
    }

    // Helper: Sort and obtain all published posts
    private static class PublishedPost {
        String id;
        String title;
        String date;
        String content;
        String font;
        String theme;
        String updatedAt;

        PublishedPost(Path file) {
            try {
                String json = Files.readString(file, StandardCharsets.UTF_8);
                this.id = file.getFileName().toString().replace(".json", "");
                this.title = extractJsonField(json, "title");
                this.date = extractJsonField(json, "createdAt");
                this.content = extractJsonField(json, "content");
                this.font = extractJsonField(json, "font");
                this.theme = extractJsonField(json, "theme");
                this.updatedAt = extractJsonField(json, "updatedAt");

                if (this.font.isEmpty())
                    this.font = "serif";
                if (this.theme.isEmpty())
                    this.theme = "cream";

                String status = extractJsonField(json, "status");
                if (!status.equalsIgnoreCase("published")) {
                    this.id = null; // Filter out drafts
                }
            } catch (Exception e) {
                this.id = null;
            }
        }
    }

    private static List<PublishedPost> getPublishedPosts() throws IOException {
        List<Path> files = Files.list(DATA_DIR)
                .filter(p -> p.toString().endsWith(".json"))
                .collect(Collectors.toList());

        List<PublishedPost> list = new ArrayList<>();
        for (Path file : files) {
            PublishedPost p = new PublishedPost(file);
            if (p.id != null) {
                list.add(p);
            }
        }
        // Newest updated first
        list.sort((a, b) -> b.updatedAt.compareTo(a.updatedAt));
        return list;
    }

    // Helper to generate the static sidebar HTML links
    private static String generateSidebarHtml(List<PublishedPost> posts, String activePostId) {
        StringBuilder html = new StringBuilder();
        for (PublishedPost p : posts) {
            boolean isActive = p.id.equals(activePostId);
            String activeClass = isActive ? " sidebar-item-active" : "";
            html.append("            <a href=\"").append(p.id).append(
                    ".html\" class=\"p-3 rounded-xl border border-transparent cursor-pointer transition-all hover:bg-white/30 flex flex-col gap-1 relative")
                    .append(activeClass).append("\">\n")
                    .append("                <div class=\"flex items-center justify-between gap-2\">\n")
                    .append("                    <span class=\"font-medium text-sm text-slate-800 truncate pr-2 w-full\">")
                    .append(p.title.isEmpty() ? "Untitled Post" : p.title).append("</span>\n")
                    .append("                    <span class=\"w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0\"></span>\n")
                    .append("                </div>\n")
                    .append("                <div class=\"flex items-center justify-between text-[11px] text-slate-400 font-mono\">\n")
                    .append("                    <span>").append(p.date).append("</span>\n")
                    .append("                </div>\n")
                    .append("            </a>\n");
        }

        if (posts.isEmpty()) {
            html.append("            <div class=\"p-4 text-center text-slate-400 text-xs font-medium\">\n")
                    .append("                No posts published yet.\n")
                    .append("            </div>\n");
        }
        return html.toString();
    }

    // Re-compiles all static pages on publish/delete to keep sidebars synchronized
    private static void recompileAllStaticFiles() throws IOException {
        List<PublishedPost> publishedList = getPublishedPosts();

        // Compile each individual published post
        for (PublishedPost post : publishedList) {
            compileStaticPostPage(post, publishedList);
        }

        // Compile index.html (the public home page)
        compilePublicIndexPage(publishedList);
    }

    // Write individual static HTML files
    private static void compileStaticPostPage(PublishedPost post, List<PublishedPost> allPublished) throws IOException {
        String sidebarHtml = generateSidebarHtml(allPublished, post.id);
        String template = getReaderTemplate(post.title, post.date, post.content, post.font, post.theme, sidebarHtml);
        Files.writeString(Paths.get("./" + post.id + ".html"), template, StandardCharsets.UTF_8);
    }

    private static String getExcerpt(String htmlContent, int maxLength) {
        if (htmlContent == null)
            return "";
        // Strip HTML tags
        String plainText = htmlContent.replaceAll("<[^>]*>", " ")
                .replaceAll("\\s+", " ")
                .trim();
        if (plainText.length() <= maxLength) {
            return plainText;
        }
        return plainText.substring(0, maxLength) + "...";
    }

    private static String getIndexTemplate(String title, String date, String content, String font, String theme,
            String sidebarHtml, String id) {
        String excerpt = getExcerpt(content, 300);

        String centerHtml = "                <!-- Summary Card Container -->\n" +
                "                <div class=\"w-full max-w-3xl flex flex-col gap-6\">\n" +
                "                    <span class=\"text-xs font-semibold text-slate-400 uppercase tracking-widest bg-white/20 px-2.5 py-1 rounded-full self-start\">Featured Story</span>\n"
                +
                "                    \n" +
                "                    <!-- The Preview Card Rectangle with Shadow -->\n" +
                "                    <div class=\"bg-white/80 backdrop-blur-md border border-slate-200/50 shadow-2xl rounded-2xl p-10 hover:-translate-y-1 hover:shadow-slate-300/30 transition-all duration-300 flex flex-col gap-6\">\n"
                +
                "                        <h1 class=\"font-sans font-extrabold text-3xl text-slate-900 leading-tight\">"
                + title + "</h1>\n" +
                "                        \n" +
                "                        <div class=\"flex items-center gap-3 text-xs font-mono text-slate-400 border-b border-dashed border-slate-200 pb-3\">\n"
                +
                "                            <span>" + date + "</span>\n" +
                "                        </div>\n" +
                "                        \n" +
                "                        <p class=\"text-slate-600 text-lg leading-relaxed\">" + excerpt + "</p>\n" +
                "                        \n" +
                "                        <div class=\"pt-4\">\n" +
                "                            <a href=\"" + id
                + ".html\" class=\"inline-flex items-center gap-2 px-6 py-3 bg-slate-800 text-white rounded-xl font-medium text-sm hover:bg-slate-700 active:scale-[0.98] transition-all shadow-md\">\n"
                +
                "                                <span>Read Full Story</span>\n" +
                "                                <i data-lucide=\"arrow-right\" class=\"w-4 h-4\"></i>\n" +
                "                            </a>\n" +
                "                        </div>\n" +
                "                    </div>\n" +
                "                </div>";

        return "<!DOCTYPE html>\n" +
                "<html lang=\"en\">\n" +
                "<head>\n" +
                "    <meta charset=\"UTF-8\">\n" +
                "    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\n" +
                "    <title>" + title + " | YuktiBharat</title>\n" +
                "    <link rel=\"icon\" type=\"image/png\" href=\"logo.png\">\n" +
                "    <!-- Tailwind CSS CDN -->\n" +
                "    <script src=\"https://cdn.tailwindcss.com\"></script>\n" +
                "    <script>\n" +
                "        tailwind.config = {\n" +
                "            theme: {\n" +
                "                extend: {\n" +
                "                    colors: {\n" +
                "                        paper: {\n" +
                "                            light: '#FCFBF9',\n" +
                "                            DEFAULT: '#F9F8F6',\n" +
                "                            dark: '#F3F1ED',\n" +
                "                            lines: '#E2E8F0',\n" +
                "                            ruled: '#D0E1FD',\n" +
                "                            margin: '#FCA5A5'\n" +
                "                        }\n" +
                "                    },\n" +
                "                    fontFamily: {\n" +
                "                        sans: ['Outfit', 'sans-serif'],\n" +
                "                        serif: ['Lora', 'Georgia', 'serif'],\n" +
                "                        mono: ['JetBrains Mono', 'monospace'],\n" +
                "                        hand: ['Caveat', 'cursive']\n" +
                "                    }\n" +
                "                }\n" +
                "            }\n" +
                "        }\n" +
                "    </script>\n" +
                "    <!-- Google Fonts -->\n" +
                "    <link rel=\"preconnect\" href=\"https://fonts.googleapis.com\">\n" +
                "    <link rel=\"preconnect\" href=\"https://fonts.gstatic.com\" crossorigin>\n" +
                "    <link href=\"https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400..700;1,400..700&family=Outfit:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&family=Caveat:wght@400..700&display=swap\" rel=\"stylesheet\">\n"
                +
                "    <!-- Lucide Icons CDN -->\n" +
                "    <script src=\"https://unpkg.com/lucide@latest\"></script>\n" +
                "    <!-- Custom Style Sheet -->\n" +
                "    <link rel=\"stylesheet\" href=\"style.css\">\n" +
                "    <!-- Google AdSense -->\n" +
                "    <script async src=\"https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-5402704750924538\"\n" +
                "     crossorigin=\"anonymous\"></script>\n" +
                "</head>\n" +
                "<body class=\"bg-paper min-h-screen text-slate-800 font-sans flex overflow-hidden relative selection:bg-blue-100\">\n"
                +
                "    <!-- Subtle Paper Grain Overlay -->\n" +
                "    <div class=\"paper-grain absolute inset-0 pointer-events-none z-[1]\"></div>\n" +
                "\n" +
                "    <!-- Main App Container -->\n" +
                "    <div class=\"flex w-full h-screen relative z-[2]\">\n" +
                "        \n" +
                "        <!-- Left Sidebar Navigation -->\n" +
                "        <aside id=\"sidebar\" class=\"w-80 h-full glass-panel flex flex-col transition-all duration-300 ease-in-out relative z-30 transform translate-x-0 overflow-hidden\">\n"
                +
                "            <!-- Sidebar Header -->\n" +
                "            <div class=\"p-5 border-b border-white/20 flex flex-col gap-2.5\">\n" +
                "                <div class=\"flex items-center justify-between w-full\">\n" +
                "                    <div class=\"flex items-center gap-3\">\n" +
                "                        <img src=\"logo.png\" alt=\"YuktiBharat Logo\" class=\"w-8 h-8 rounded-lg shadow-sm object-cover flex-shrink-0\">\n"
                +
                "                        <span class=\"font-bold text-lg tracking-wide text-slate-800\">YuktiBharat</span>\n"
                +
                "                    </div>\n" +
                "                    <!-- Hide Sidebar Button -->\n" +
                "                    <button id=\"toggle-sidebar-btn\" class=\"p-1.5 rounded-lg hover:bg-white/30 text-slate-600 hover:text-slate-900 transition-colors\">\n"
                +
                "                        <i data-lucide=\"chevrons-left\" class=\"w-5 h-5\"></i>\n" +
                "                    </button>\n" +
                "                </div>\n" +
                "                <!-- Tagline -->\n" +
                "                <div class=\"text-[10px] font-medium text-slate-400 tracking-wider uppercase pl-1.5\">\n"
                +
                "                    Fixing India with Ideas\n" +
                "                </div>\n" +
                "            </div>\n" +
                "\n" +
                "            <!-- Search Bar -->\n" +
                "            <div class=\"p-4\">\n" +
                "                <div class=\"relative flex items-center\">\n" +
                "                    <i data-lucide=\"search\" class=\"w-4 h-4 absolute left-3 text-slate-400\"></i>\n"
                +
                "                    <input type=\"text\" id=\"search-posts\" placeholder=\"Search entries...\" class=\"w-full bg-white/40 border border-white/40 rounded-xl py-2 pl-9 pr-4 text-sm focus:outline-none focus:border-slate-400 focus:bg-white/60 transition-all placeholder-slate-400\">\n"
                +
                "                </div>\n" +
                "            </div>\n" +
                "\n" +
                "            <!-- Scrollable Post List -->\n" +
                "            <div class=\"flex-1 overflow-y-auto px-3 py-2 space-y-1 custom-scrollbar\" id=\"posts-list\">\n"
                +
                sidebarHtml +
                "            </div>\n" +
                "\n" +
                "            <!-- Footer -->\n" +
                "            <div class=\"p-4 border-t border-white/20 text-center\">\n" +
                "                <span class=\"text-[10px] text-slate-400 font-mono\">&copy; 2026 YuktiBharat</span>\n"
                +
                "            </div>\n" +
                "        </aside>\n" +
                "\n" +
                "        <!-- Floating Sidebar Toggle Trigger -->\n" +
                "        <button id=\"floating-menu-btn\" class=\"hidden absolute top-4 left-4 z-40 p-2.5 rounded-xl glass-panel shadow-md text-slate-700 hover:bg-white/50 active:scale-95 transition-all\">\n"
                +
                "            <i data-lucide=\"menu\" class=\"w-6 h-6\"></i>\n" +
                "        </button>\n" +
                "\n" +
                "        <!-- Main Workspace -->\n" +
                "        <main class=\"flex-1 h-full flex flex-col overflow-hidden relative\">\n" +
                "            \n" +
                "            <!-- Top Header Bar -->\n" +
                "            <header class=\"h-16 px-6 glass-panel border-b border-white/20 flex items-center justify-between relative z-20\">\n"
                +
                "                <div class=\"flex items-center gap-4\">\n" +
                "                    <div id=\"header-spacer\" class=\"w-0 transition-all duration-300\"></div>\n" +
                "                    <div id=\"header-brand\" class=\"flex items-center gap-2.5 opacity-0 w-0 overflow-hidden transition-all duration-300\">\n"
                +
                "                        <img src=\"logo.png\" alt=\"YuktiBharat Logo\" class=\"w-7 h-7 rounded-lg shadow-sm object-cover flex-shrink-0\">\n"
                +
                "                        <span class=\"font-bold text-base tracking-wide text-slate-800\">YuktiBharat</span>\n"
                +
                "                    </div>\n" +
                "                </div>\n" +
                "            </header>\n" +
                "\n" +
                "            <!-- Content Viewport -->\n" +
                "            <div class=\"flex-1 overflow-y-auto py-16 px-8 flex justify-center items-center custom-scrollbar bg-paper-dark/30 relative z-10\" id=\"editor-viewport\">\n"
                +
                centerHtml +
                "                <!-- Sidebar Ad Panel -->\n" +
                "                <div class=\"sidebar-ad-container\">\n" +
                "                    <span class=\"text-[9px] font-bold text-slate-400/60 uppercase tracking-widest mb-2\">Advertisement</span>\n" +
                "                    <ins class=\"adsbygoogle\"\n" +
                "                         style=\"display:block;width:100%;height:100%;\"\n" +
                "                         data-ad-client=\"ca-pub-5402704750924538\"\n" +
                "                         data-ad-slot=\"5973319899\"\n" +
                "                         data-ad-format=\"auto\"\n" +
                "                         data-full-width-responsive=\"true\"></ins>\n" +
                "                    <script>\n" +
                "                         (adsbygoogle = window.adsbygoogle || []).push({});\n" +
                "                    </script>\n" +
                "                </div>\n" +
                "            </div>\n" +
                "        </main>\n" +
                "    </div>\n" +
                "\n" +
                "    <!-- Scripts for Static Readers -->\n" +
                "    <script>\n" +
                "        lucide.createIcons();\n" +
                "\n" +
                "        // Sidebar Collapse Toggle\n" +
                "        const sidebar = document.getElementById('sidebar');\n" +
                "        const toggleSidebarBtn = document.getElementById('toggle-sidebar-btn');\n" +
                "        const floatingMenuBtn = document.getElementById('floating-menu-btn');\n" +
                "        const headerSpacer = document.getElementById('header-spacer');\n" +
                "        const headerBrand = document.getElementById('header-brand');\n" +
                "\n" +
                "        function toggleSidebar() {\n" +
                "            sidebar.classList.toggle('collapsed');\n" +
                "            const isClosed = sidebar.classList.contains('collapsed');\n" +
                "            if (isClosed) {\n" +
                "                floatingMenuBtn.classList.remove('hidden');\n" +
                "                headerSpacer.className = 'w-12';\n" +
                "                if (headerBrand) {\n" +
                "                    headerBrand.classList.remove('opacity-0', 'w-0');\n" +
                "                    headerBrand.classList.add('opacity-100', 'w-auto');\n" +
                "                }\n" +
                "            } else {\n" +
                "                floatingMenuBtn.classList.add('hidden');\n" +
                "                headerSpacer.className = 'w-0';\n" +
                "                if (headerBrand) {\n" +
                "                    headerBrand.classList.remove('opacity-100', 'w-auto');\n" +
                "                    headerBrand.classList.add('opacity-0', 'w-0');\n" +
                "                }\n" +
                "            }\n" +
                "        }\n" +
                "\n" +
                "        toggleSidebarBtn.addEventListener('click', toggleSidebar);\n" +
                "        floatingMenuBtn.addEventListener('click', () => {\n" +
                "            sidebar.classList.remove('collapsed');\n" +
                "            floatingMenuBtn.classList.add('hidden');\n" +
                "            headerSpacer.className = 'w-0';\n" +
                "            if (headerBrand) {\n" +
                "                headerBrand.classList.remove('opacity-100', 'w-auto');\n" +
                "                headerBrand.classList.add('opacity-0', 'w-0');\n" +
                "            }\n" +
                "        });\n" +
                "\n" +
                "        // Static Search filter\n" +
                "        document.getElementById('search-posts').addEventListener('input', (e) => {\n" +
                "            const query = e.target.value.toLowerCase();\n" +
                "            document.querySelectorAll('#posts-list > a').forEach(item => {\n" +
                "                const text = item.textContent.toLowerCase();\n" +
                "                if (text.includes(query)) {\n" +
                "                    item.classList.remove('hidden');\n" +
                "                } else {\n" +
                "                    item.classList.add('hidden');\n" +
                "                }\n" +
                "            });\n" +
                "        });\n" +
                "    </script>\n" +
                "</body>\n" +
                "</html>";
    }

    // Compile index.html
    private static void compilePublicIndexPage(List<PublishedPost> allPublished) throws IOException {
        if (!allPublished.isEmpty()) {
            // Serve the latest post as a preview card on the landing index page
            PublishedPost latest = allPublished.get(0);
            String sidebarHtml = generateSidebarHtml(allPublished, latest.id);
            String template = getIndexTemplate(latest.title, latest.date, latest.content, latest.font, latest.theme,
                    sidebarHtml, latest.id);
            Files.writeString(Paths.get("./index.html"), template, StandardCharsets.UTF_8);
        } else {
            // Default blank state page
            String welcomeHtml = "<p>Welcome! This site has no published posts yet.</p>" +
                    "<p>Open <a href=\"editor.html\" class=\"text-blue-500 hover:underline\">editor.html</a> locally to write and publish your first story!</p>";
            String sidebarHtml = generateSidebarHtml(new ArrayList<>(), "");
            String template = getReaderTemplate("Welcome to Paper-Glass Blog", "", welcomeHtml, "serif", "cream",
                    sidebarHtml);
            Files.writeString(Paths.get("./index.html"), template, StandardCharsets.UTF_8);
        }
    }

    // Helper: Trigger index compilation from main()
    private static void compilePublicIndex() throws IOException {
        recompileAllStaticFiles();
    }

    // Reader HTML Template matching the editor's visual layout
    private static String getReaderTemplate(String title, String date, String content, String font, String theme,
            String sidebarHtml) {
        return "<!DOCTYPE html>\n" +
                "<html lang=\"en\">\n" +
                "<head>\n" +
                "    <meta charset=\"UTF-8\">\n" +
                "    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\n" +
                "    <title>" + title + " | YuktiBharat</title>\n" +
                "    <link rel=\"icon\" type=\"image/png\" href=\"logo.png\">\n" +
                "    <!-- Tailwind CSS CDN -->\n" +
                "    <script src=\"https://cdn.tailwindcss.com\"></script>\n" +
                "    <script>\n" +
                "        tailwind.config = {\n" +
                "            theme: {\n" +
                "                extend: {\n" +
                "                    colors: {\n" +
                "                        paper: {\n" +
                "                            light: '#FCFBF9',\n" +
                "                            DEFAULT: '#F9F8F6',\n" +
                "                            dark: '#F3F1ED',\n" +
                "                            lines: '#E2E8F0',\n" +
                "                            ruled: '#D0E1FD',\n" +
                "                            margin: '#FCA5A5'\n" +
                "                        }\n" +
                "                    },\n" +
                "                    fontFamily: {\n" +
                "                        sans: ['Outfit', 'sans-serif'],\n" +
                "                        serif: ['Lora', 'Georgia', 'serif'],\n" +
                "                        mono: ['JetBrains Mono', 'monospace'],\n" +
                "                        hand: ['Caveat', 'cursive']\n" +
                "                    }\n" +
                "                }\n" +
                "            }\n" +
                "        }\n" +
                "    </script>\n" +
                "    <!-- Google Fonts -->\n" +
                "    <link rel=\"preconnect\" href=\"https://fonts.googleapis.com\">\n" +
                "    <link rel=\"preconnect\" href=\"https://fonts.gstatic.com\" crossorigin>\n" +
                "    <link href=\"https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400..700;1,400..700&family=Outfit:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&family=Caveat:wght@400..700&display=swap\" rel=\"stylesheet\">\n"
                +
                "    <!-- Lucide Icons CDN -->\n" +
                "    <script src=\"https://unpkg.com/lucide@latest\"></script>\n" +
                "    <!-- Custom Style Sheet -->\n" +
                "    <link rel=\"stylesheet\" href=\"style.css\">\n" +
                "    <!-- Google AdSense -->\n" +
                "    <script async src=\"https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-5402704750924538\"\n" +
                "     crossorigin=\"anonymous\"></script>\n" +
                "</head>\n" +
                "<body class=\"bg-paper min-h-screen text-slate-800 font-sans flex overflow-hidden relative selection:bg-blue-100\">\n"
                +
                "    <!-- Subtle Paper Grain Overlay -->\n" +
                "    <div class=\"paper-grain absolute inset-0 pointer-events-none z-[1]\"></div>\n" +
                "\n" +
                "    <!-- Main App Container -->\n" +
                "    <div class=\"flex w-full h-screen relative z-[2]\">\n" +
                "        \n" +
                "        <!-- Left Sidebar Navigation -->\n" +
                "        <aside id=\"sidebar\" class=\"w-80 h-full glass-panel flex flex-col transition-all duration-300 ease-in-out relative z-30 transform translate-x-0 overflow-hidden\">\n"
                +
                "            <!-- Sidebar Header -->\n" +
                "            <div class=\"p-5 border-b border-white/20 flex flex-col gap-2.5\">\n" +
                "                <div class=\"flex items-center justify-between w-full\">\n" +
                "                    <div class=\"flex items-center gap-3\">\n" +
                "                        <img src=\"logo.png\" alt=\"YuktiBharat Logo\" class=\"w-8 h-8 rounded-lg shadow-sm object-cover flex-shrink-0\">\n"
                +
                "                        <span class=\"font-bold text-lg tracking-wide text-slate-800\">YuktiBharat</span>\n"
                +
                "                    </div>\n" +
                "                    <!-- Hide Sidebar Button -->\n" +
                "                    <button id=\"toggle-sidebar-btn\" class=\"p-1.5 rounded-lg hover:bg-white/30 text-slate-600 hover:text-slate-900 transition-colors\">\n"
                +
                "                        <i data-lucide=\"chevrons-left\" class=\"w-5 h-5\"></i>\n" +
                "                    </button>\n" +
                "                </div>\n" +
                "                <!-- Tagline -->\n" +
                "                <div class=\"text-[10px] font-medium text-slate-400 tracking-wider uppercase pl-1.5\">\n"
                +
                "                    Fixing India with Ideas\n" +
                "                </div>\n" +
                "            </div>\n" +
                "\n" +
                "            <!-- Search Bar -->\n" +
                "            <div class=\"p-4\">\n" +
                "                <div class=\"relative flex items-center\">\n" +
                "                    <i data-lucide=\"search\" class=\"w-4 h-4 absolute left-3 text-slate-400\"></i>\n"
                +
                "                    <input type=\"text\" id=\"search-posts\" placeholder=\"Search entries...\" class=\"w-full bg-white/40 border border-white/40 rounded-xl py-2 pl-9 pr-4 text-sm focus:outline-none focus:border-slate-400 focus:bg-white/60 transition-all placeholder-slate-400\">\n"
                +
                "                </div>\n" +
                "            </div>\n" +
                "\n" +
                "            <!-- Scrollable Post List -->\n" +
                "            <div class=\"flex-1 overflow-y-auto px-3 py-2 space-y-1 custom-scrollbar\" id=\"posts-list\">\n"
                +
                sidebarHtml +
                "            </div>\n" +
                "\n" +
                "            <!-- Footer -->\n" +
                "            <div class=\"p-4 border-t border-white/20 text-center\">\n" +
                "                <span class=\"text-[10px] text-slate-400 font-mono\">&copy; 2026 YuktiBharat</span>\n"
                +
                "            </div>\n" +
                "        </aside>\n" +
                "\n" +
                "        <!-- Floating Sidebar Toggle Trigger -->\n" +
                "        <button id=\"floating-menu-btn\" class=\"hidden absolute top-4 left-4 z-40 p-2.5 rounded-xl glass-panel shadow-md text-slate-700 hover:bg-white/50 active:scale-95 transition-all\">\n"
                +
                "            <i data-lucide=\"menu\" class=\"w-6 h-6\"></i>\n" +
                "        </button>\n" +
                "\n" +
                "        <!-- Main Workspace -->\n" +
                "        <main class=\"flex-1 h-full flex flex-col overflow-hidden relative\">\n" +
                "            \n" +
                "            <!-- Top Header Bar -->\n" +
                "            <header class=\"h-16 px-6 glass-panel border-b border-white/20 flex items-center justify-between relative z-20\">\n"
                +
                "                <div class=\"flex items-center gap-4\">\n" +
                "                    <div id=\"header-spacer\" class=\"w-0 transition-all duration-300\"></div>\n" +
                "                    <div id=\"header-brand\" class=\"flex items-center gap-2.5 opacity-0 w-0 overflow-hidden transition-all duration-300\">\n"
                +
                "                        <img src=\"logo.png\" alt=\"YuktiBharat Logo\" class=\"w-7 h-7 rounded-lg shadow-sm object-cover flex-shrink-0\">\n"
                +
                "                        <span class=\"font-bold text-base tracking-wide text-slate-800\">YuktiBharat</span>\n"
                +
                "                    </div>\n" +
                "                </div>\n" +
                "            </header>\n" +
                "\n" +
                "            <!-- Reader Content Area (FIXED: items-start added here) -->\n" +
                "            <div class=\"flex-1 overflow-y-auto py-12 px-6 flex justify-center items-start custom-scrollbar bg-paper-dark/30 relative z-10\" id=\"editor-viewport\">\n"
                +
                "                <!-- Ruled Paper Sheet -->\n" +
                "                <article id=\"paper-sheet\" class=\"w-full max-w-5xl min-h-[85vh] bg-paper-light shadow-xl rounded-2xl border border-slate-200/50 flex flex-col relative py-12 theme-"
                + theme + " font-" + font + "\">\n" +
                "                    \n" +
                "                    <!-- Paper Vertical Margin Line (Red) -->\n" +
                "                    <div class=\"absolute top-0 bottom-0 left-[79px] w-[1px] bg-red-300 pointer-events-none z-10\"></div>\n"
                +
                "                    \n" +
                "                    <div class=\"flex flex-col flex-1 pl-[96px] pr-12 relative z-20\">\n" +
                "                        <h1 class=\"font-bold text-4xl mb-6 outline-none text-slate-900 leading-tight\">"
                + title + "</h1>\n" +
                "                        \n" +
                "                        <!-- Metadata Line -->\n" +
                "                        <div class=\"flex items-center gap-4 text-xs font-mono text-slate-400 mb-8 border-b border-dashed border-slate-200 pb-3\">\n"
                +
                "                            <span>" + date + "</span>\n" +
                "                        </div>\n" +
                "\n" +
                "                        <!-- Article Content -->\n" +
                "                        <div id=\"editor-body\" class=\"text-lg leading-[2rem] outline-none text-slate-800 flex-1\">\n"
                +
                "                            " + content + "\n" +
                "                        </div>\n" +
                "                    </div>\n" +
                "                </article>\n" +
                "                <!-- Sidebar Ad Panel -->\n" +
                "                <div class=\"sidebar-ad-container\">\n" +
                "                    <span class=\"text-[9px] font-bold text-slate-400/60 uppercase tracking-widest mb-2\">Advertisement</span>\n" +
                "                    <ins class=\"adsbygoogle\"\n" +
                "                         style=\"display:block;width:100%;height:100%;\"\n" +
                "                         data-ad-client=\"ca-pub-5402704750924538\"\n" +
                "                         data-ad-slot=\"5973319899\"\n" +
                "                         data-ad-format=\"auto\"\n" +
                "                         data-full-width-responsive=\"true\"></ins>\n" +
                "                    <script>\n" +
                "                         (adsbygoogle = window.adsbygoogle || []).push({});\n" +
                "                    </script>\n" +
                "                </div>\n" +
                "            </div>\n" +
                "        </main>\n" +
                "    </div>\n" +
                "\n" +
                "    <!-- Scripts for Static Readers -->\n" +
                "    <script>\n" +
                "        lucide.createIcons();\n" +
                "\n" +
                "        // Sidebar Collapse Toggle\n" +
                "        const sidebar = document.getElementById('sidebar');\n" +
                "        const toggleSidebarBtn = document.getElementById('toggle-sidebar-btn');\n" +
                "        const floatingMenuBtn = document.getElementById('floating-menu-btn');\n" +
                "        const headerSpacer = document.getElementById('header-spacer');\n" +
                "        const headerBrand = document.getElementById('header-brand');\n" +
                "\n" +
                "        function toggleSidebar() {\n" +
                "            sidebar.classList.toggle('collapsed');\n" +
                "            const isClosed = sidebar.classList.contains('collapsed');\n" +
                "            if (isClosed) {\n" +
                "                floatingMenuBtn.classList.remove('hidden');\n" +
                "                headerSpacer.className = 'w-12';\n" +
                "                if (headerBrand) {\n" +
                "                    headerBrand.classList.remove('opacity-0', 'w-0');\n" +
                "                    headerBrand.classList.add('opacity-100', 'w-auto');\n" +
                "                }\n" +
                "            } else {\n" +
                "                floatingMenuBtn.classList.add('hidden');\n" +
                "                headerSpacer.className = 'w-0';\n" +
                "                if (headerBrand) {\n" +
                "                    headerBrand.classList.remove('opacity-100', 'w-auto');\n" +
                "                    headerBrand.classList.add('opacity-0', 'w-0');\n" +
                "                }\n" +
                "            }\n" +
                "        }\n" +
                "\n" +
                "        toggleSidebarBtn.addEventListener('click', toggleSidebar);\n" +
                "        floatingMenuBtn.addEventListener('click', () => {\n" +
                "            sidebar.classList.remove('collapsed');\n" +
                "            floatingMenuBtn.classList.add('hidden');\n" +
                "            headerSpacer.className = 'w-0';\n" +
                "            if (headerBrand) {\n" +
                "                headerBrand.classList.remove('opacity-100', 'w-auto');\n" +
                "                headerBrand.classList.add('opacity-0', 'w-0');\n" +
                "            }\n" +
                "        });\n" +
                "\n" +
                "        // Static Search filter\n" +
                "        document.getElementById('search-posts').addEventListener('input', (e) => {\n" +
                "            const query = e.target.value.toLowerCase();\n" +
                "            document.querySelectorAll('#posts-list > a').forEach(item => {\n" +
                "                const text = item.textContent.toLowerCase();\n" +
                "                if (text.includes(query)) {\n" +
                "                    item.classList.remove('hidden');\n" +
                "                } else {\n" +
                "                    item.classList.add('hidden');\n" +
                "                }\n" +
                "            });\n" +
                "        });\n" +
                "    </script>\n" +
                "</body>\n" +
                "</html>";
    }

    private static String extractJsonField(String json, String field) {
        String key = "\"" + field + "\"";
        int startIdx = json.indexOf(key);
        if (startIdx == -1)
            return "";

        int colonIdx = json.indexOf(":", startIdx + key.length());
        if (colonIdx == -1)
            return "";

        int quoteIdx = json.indexOf("\"", colonIdx + 1);
        if (quoteIdx == -1)
            return "";

        StringBuilder sb = new StringBuilder();
        boolean escaped = false;
        for (int i = quoteIdx + 1; i < json.length(); i++) {
            char c = json.charAt(i);
            if (escaped) {
                if (c == 'n') {
                    sb.append('\n');
                } else if (c == 't') {
                    sb.append('\t');
                } else if (c == 'r') {
                    sb.append('\r');
                } else if (c == 'b') {
                    sb.append('\b');
                } else if (c == 'f') {
                    sb.append('\f');
                } else if (c == 'u') {
                    if (i + 4 < json.length()) {
                        String hex = json.substring(i + 1, i + 5);
                        try {
                            char code = (char) Integer.parseInt(hex, 16);
                            sb.append(code);
                            i += 4;
                        } catch (NumberFormatException e) {
                            sb.append('u');
                        }
                    } else {
                        sb.append('u');
                    }
                } else {
                    sb.append(c);
                }
                escaped = false;
            } else if (c == '\\') {
                escaped = true;
            } else if (c == '"') {
                break;
            } else {
                sb.append(c);
            }
        }
        return sb.toString();
    }
}
