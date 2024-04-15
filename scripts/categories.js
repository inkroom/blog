/* global hexo */

'use strict';
const pagination = require('hexo-pagination');
hexo.config.category_generator = Object.assign({
  per_page: typeof hexo.config.per_page === 'undefined' ? 10 : hexo.config.per_page
}, hexo.config.category_generator);

hexo.extend.generator.register('category', function(locals){
    const config = this.config;
    const perPage = config.category_generator.per_page;
    const paginationDir = config.pagination_dir || 'page';
    const orderBy = config.category_generator.order_by || '-date';
    locals.categories.data = locals.categories.data.filter(s=>s.name!='private');
    locals.categories.length = locals.categories.data.length;

    let r = locals.categories.data.reduce((result, category) => {
      if (!category.length) return result;
  
      const posts = category.posts.sort(orderBy);
      const data = pagination(category.path, posts, {
        perPage,
        layout: ['category', 'archive', 'index'],
        format: paginationDir + '/%d/',
        data: {
          category: category.name
        }
      });
  
      return result.concat(data);
    }, []);
    return r;
});
