import core from '@actions/core';
import dayjs from 'dayjs';
import { parse } from 'rss-to-json';
import { RssFeed, RssFeedItem } from '../types.d';
import { checkCache, readCache } from './cache';

// Gets the feed, checks the cache (or time since last run), and returns new items
const getFeed = async (
  rssFeed: string,
  cacheDir: string | undefined,
  interval: number | undefined,
  title_filter_include: string,
  title_filter_exclude: string
): Promise<{ filtered: RssFeedItem[]; unfiltered: RssFeed; cached: string[] }> => {
  core.debug(`Retrieving ${rssFeed}…`);

  const rss: RssFeed = await parse(rssFeed, {});
  core.debug(`Feed has ${rss?.items?.length} items`);

  const filteredItems = filterFeed(rss.items ?? [], title_filter_include, title_filter_exclude);
  core.debug('Filtered items: ' + filteredItems.length);

  if (filteredItems.length) {
    let toSend: RssFeedItem[] = [];
    let cached: string[] = [];

    if (cacheDir) {
      core.debug(`Retrieving previously cached entries…`);

      try {
        cached = await readCache(rssFeed, cacheDir);
        toSend = (await checkCache(rss, cached)).filter(item => {
          return dayjs(item.created).isAfter(dayjs().subtract(1, 'hour'));
        });
      } catch (err) {
        core.debug((<Error>err).message);

        toSend = filteredItems.filter(item => {
          return dayjs(item.created).isAfter(dayjs().subtract(1, 'hour'));
        });
      }
    } else if (interval) {
      core.debug(`Selecting items posted in the last ${interval} minutes…`);

      toSend = filteredItems.filter(item => {
        return dayjs(item.created).isAfter(dayjs().subtract(interval, 'minute'));
      });
    }

    return { filtered: toSend, unfiltered: rss, cached: cached };
  } else {
    throw new Error('No feed items found');
  }
};

export { getFeed };

// Filters the feed items by title if a filter is provided
const filterFeed = (filtered: RssFeedItem[], title_filter_include?: string, title_filter_exclude?: string): RssFeedItem[] => {
  const includeFilters = (title_filter_include && title_filter_include !== "") ? title_filter_include.split(",").map(filter => filter.trim()) : [];
  const excludeFilters = (title_filter_exclude && title_filter_exclude !== "") ? title_filter_exclude.split(",").map(filter => filter.trim()) : [];
  core.debug(`Include filters: ${includeFilters} ${includeFilters.length}`);
  core.debug(`Exclude filters: ${excludeFilters} ${excludeFilters.length}`);

  if (includeFilters.length === 0 && excludeFilters.length === 0) {
    core.debug('No filters provided, returning all items');
    return filtered;
  }

  return filtered.filter(item => {
    core.debug(`Checking item: ${item.title}`);
    return (includeFilters.length === 0 || includeFilters.some(filter => item.title?.includes(filter))) &&
           (excludeFilters.length === 0 || !excludeFilters.some(filter => item.title?.includes(filter)));
  });
};