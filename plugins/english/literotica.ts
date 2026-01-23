import { load as loadCheerio } from 'cheerio';
import { fetchApi } from '@libs/fetch';
import { Plugin } from '@typings/plugin';
import { defaultCover } from '@libs/defaultCover';

const baseUrl = 'https://www.literotica.com';

function absolute(url: string) {
  if (url.startsWith('http')) return url;
  return baseUrl + url;
}

async function loadAllChapterPages(firstPageUrl: string): Promise<string> {
  let page = 1;
  let content = '';
  let hasNext = true;

  while (hasNext) {
    const url = page === 1 ? firstPageUrl : `${firstPageUrl}?page=${page}`;
    const html = await fetchApi(url);
    const $ = loadCheerio(html);

    const story = $('.aa_ht, .b-story-body, .story-content').first();
    if (!story.length) break;

    story.find('script, iframe, ads, .adunit').remove();

    story.find('p').each((_, el) => {
      const t = $(el).text().trim();
      if (t) content += t + '\n\n';
    });

    // Literotica shows pagination links
    const nextExists = $('.pagination a')
      .toArray()
      .some(a => $(a).text().trim() === (page + 1).toString());

    hasNext = nextExists;
    page++;
  }

  return content.trim();
}

const plugin: Plugin = {
  id: 'literotica',
  name: 'Literotica',
  icon: 'src/en/literotica/icon.png',
  site: baseUrl,
  version: '1.0.0',

  matches: [
    /^https?:\/\/www\.literotica\.com\/series\/se\/\d+/,
    /^https?:\/\/www\.literotica\.com\/s\/.+/,
  ],

  async popularNovels() {
    const html = await fetchApi(baseUrl);
    const $ = loadCheerio(html);

    return $('.story-card, .b-story-card')
      .slice(0, 20)
      .map((_, el) => {
        const a = $(el).find('a').first();
        const title = a.text().trim();
        const url = absolute(a.attr('href')!);
        return {
          title,
          url,
          cover: defaultCover(title),
        };
      })
      .get();
  },

  async searchNovels(query) {
    const html = await fetchApi(
      `${baseUrl}/search?q=${encodeURIComponent(query)}`,
    );
    const $ = loadCheerio(html);

    return $('.search-result, .b-story-card')
      .map((_, el) => {
        const a = $(el).find('a').first();
        const title = a.text().trim();
        const url = absolute(a.attr('href')!);
        return {
          title,
          url,
          cover: defaultCover(title),
        };
      })
      .get();
  },

  async load(url) {
    // SERIES PAGE
    if (url.includes('/series/')) {
      const html = await fetchApi(url);
      const $ = loadCheerio(html);

      const title = $('h1').first().text().trim();
      const author = $('.author a').first().text().trim() || 'Unknown';

      const chapters = $('.series-list a')
        .map((i, el) => ({
          title: $(el).text().trim(),
          url: absolute($(el).attr('href')!),
        }))
        .get();

      return {
        title,
        author,
        cover: defaultCover(title),
        url,
        chapters,
      };
    }

    // SINGLE CHAPTER URL → create virtual novel
    const html = await fetchApi(url);
    const $ = loadCheerio(html);

    const title = $('h1').first().text().trim();
    const author = $('.author a').first().text().trim() || 'Unknown';

    return {
      title,
      author,
      cover: defaultCover(title),
      url,
      chapters: [{ title, url }],
    };
  },

  async loadChapter(url) {
    const html = await fetchApi(url);
    const $ = loadCheerio(html);

    const title = $('h1').first().text().trim();
    const content = await loadAllChapterPages(url);

    return {
      title,
      content,
    };
  },
};

export default plugin;
