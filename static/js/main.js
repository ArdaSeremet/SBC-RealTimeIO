$(() => {
	$("ul.menu").hide();
	$(".menu-toggler").on('click', () => {
		$("ul.menu").animate({'height': 'toggle'}, 200);
	});
	$(window).resize(() => {
		if($(window).width() > 720) {
			$("ul.menu").show();
			$("ul.menu").css('display', 'flex');
		}
	});
	if($(window).width() > 720) {
		$("ul.menu").show();
		$("ul.menu").css('display', 'flex');
	}
});