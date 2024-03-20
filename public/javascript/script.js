// JavaScript function to show the SweetAlert confirmation dialog when delete button is clicked
function submitForm(link) {
    Swal.fire({
        title: "Are you sure?",
        text: "This action cannot be undone",
        icon: "warning",
        showCancelButton: true,
        confirmButtonColor: "#DD6B55",
        confirmButtonText: "Yes, delete it!",
        cancelButtonText: "Cancel",
        closeOnConfirm: false,
        closeOnCancel: true
    }).then((result) => {
        if (result.isConfirmed) {
            window.location.href = link.getAttribute('href');
        }
    });
    return false;
}
