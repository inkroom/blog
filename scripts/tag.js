'use strict';

const pagination = require('hexo-pagination');
hexo.config.tag_generator = Object.assign({
    per_page: hexo.config.per_page == null ? 10 : hexo.config.per_page
  }, hexo.config.tag_generator);
  hexo.extend.generator.register('tag', function(locals) {
    const config = this.config;
    const perPage = config.tag_generator.per_page;
    const paginationDir = config.pagination_dir || 'page';
    const orderBy = config.tag_generator.order_by || '-date';
    locals.tags.data = locals.tags.data.filter(s=>s.name!='private');
    locals.tags.length = locals.tags.data.length;
    const tags = locals.tags;
    let tagDir;
  
    const pages = tags.reduce((result, tag) => {
      if (!tag.length) return result;
  
      const posts = tag.posts.sort(orderBy);
      const data = pagination(tag.path, posts, {
        perPage: perPage,
        layout: ['tag', 'archive', 'index'],
        format: paginationDir + '/%d/',
        data: {
          tag: tag.name
        }
      });
  
      return result.concat(data);
    }, []);
  
    // generate tag index page, usually /tags/index.html
    if (config.tag_generator.enable_index_page) {
      tagDir = config.tag_dir;
      if (tagDir[tagDir.length - 1] !== '/') {
        tagDir += '/';
      }
  
      pages.push({
        path: tagDir,
        layout: ['tag-index', 'tag', 'archive', 'index'],
        posts: locals.posts,
        data: {
          base: tagDir,
          total: 1,
          current: 1,
          current_url: tagDir,
          posts: locals.posts,
          prev: 0,
          prev_link: '',
          next: 0,
          next_link: '',
          tags: tags
        }
      });
    }
  
    return pages;
  });
