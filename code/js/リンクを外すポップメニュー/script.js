scrapbox.PopupMenu.addButton({
  title: 'unlink',
  onClick: text => {
      const result = text.split(/\n/)
      .map(line => line.replace(/\[([^\[!"#%&'()\*\+,\-\.\/\{\|\}<>_~][^\[\]]*)\]/g,'$1')).join('\n');
      if(text == result) return;
      return result;
    }
});