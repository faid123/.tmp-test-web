using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Events;
using UnityEngine.EventSystems;
using UnityEngine.UI;
using TMPro;
using Lean.Touch;

public class ComponentSelect : MonoBehaviour, IPointerClickHandler
{
    RPD_2D_ContextMenu ContextMenu;
    GameObject contextCatcher;
    //SelectionList_2DRPD selectList;

    public RPDComponent rpdComponent;
    public GenericTooth toothOverride = null;

    public GameObject circleHoldingUI;
    Image circleimg;
    LeanSelectable leanSel;
    TouchManager touch;

    void Start()
    {
        this.gameObject.GetComponent<Image>().alphaHitTestMinimumThreshold = 0.2f;

        touch = GameObject.Find("TouchManager").GetComponent<TouchManager>();

        ContextMenu = GameObject.Find("2DRPD_ContextMenu").GetComponent<RPD_2D_ContextMenu>();
        //contextCatcher = GameObject.Find("CloseMenusCatcher");
        circleHoldingUI = GameObject.Find("CursorFollow-Circle");
        circleimg = circleHoldingUI.GetComponent<Image>();
        //selectList = GameObject.Find("ComponentSelectionList").GetComponent<SelectionList_2DRPD>();

        leanSel = gameObject.AddComponent<LeanSelectable>();

        gameObject.AddComponent<CanvasGroup>();
        //LeanSelectableGraphicColor leanSelGraphic = gameObject.AddComponent<LeanSelectableGraphicColor>();

        leanSel.DeselectOnUp = true;
        //leanSelGraphic.AutoGetDefaultColor = true;
        //leanSelGraphic.SelectedColor = Color.HSVToRGB(170,80,80);

        leanSel.OnSelect.AddListener(HandleSelect);
    }

    private void Update()
    {
        if (leanSel.IsSelected)
        {
            if (leanSel.SelectingFinger.GetStartScreenDistance(leanSel.SelectingFinger.ScreenPosition) <= touch.fingerMovementThreshold)
            {
                if (circleimg.fillAmount < 1 && leanSel.SelectingFinger.Age > 0.1)
                {
                    print("reading");
                    circleimg.fillAmount = leanSel.SelectingFinger.Age;
                }

                else if (circleimg.fillAmount == 1)
                    ContextMenuFunction();
            }

            else
                circleimg.fillAmount = 0;
        }
    }

    void HandleSelect(Lean.Touch.LeanFinger finger)
    {

    }

    /// <summary>
    /// Checks for Mouse Pointer Click event
    /// </summary>
    /// <param name="eventData">eventData of MouseClick</param>
    public void OnPointerClick(PointerEventData eventData)
    {
        if (eventData.button == PointerEventData.InputButton.Right)
        {
            Debug.Log("Right Mouse Button Clicked on: " + name);

            ContextMenuFunction();
        }

        //if left click, add to list selection
        /*else if(eventData.button == PointerEventData.InputButton.Left)
        {
            Debug.Log("Left Mouse Button Clicked on: " + name);
            selectList.selCompText.text = this.name;
            selectList.AddSelection((RPD_2DComponent.componentType)System.Enum.Parse(typeof(RPD_2DComponent.componentType), this.name));

            //check and set bar end
            //GetComponentInParent<GenericTooth>().CheckSetBarEnd();
        }*/
    }

    /// <summary>
    /// Calls for the context menu to be placed in appropriate location
    /// and also to display appropriate UI such as Component Name
    /// </summary>
    public void ContextMenuFunction()
    {
        if (ContextMenu != null)
            ContextMenu.transform.position = this.transform.position;

        //contextCatcher.gameObject.GetComponent<Image>().enabled = true;
        UI_PopupPanel.instance.TurnBlockerOn(true);

        if (RPDManager.instance.useNew2DSystem)
        {
            ContextMenu.SetTooth(toothOverride == null ? transform.GetComponentInParent<GenericTooth>() : toothOverride, rpdComponent);
            ContextMenu.SetLabelText(rpdComponent.displayName);
            ContextMenu.ShowMeshDeleteBtn();

            return;
        }

        if (name.Contains("Slot"))
        {
            ContextMenu.BallRetainer = this.gameObject;
            ContextMenu.SelectedComponent = RPD_2DComponent.componentType.r_ball;
            ContextMenu.SetLabelText(RPD_2DComponent.GetName(RPD_2DComponent.componentType.r_ball));
        }

        else if (name.Contains("_reciprocating_clasp"))
        {
            ContextMenu.SetTooth(transform.GetComponentInParent<GenericTooth>(), RPD_2DComponent.componentType.reciprocating_clasp);
            ContextMenu.ShowMeshDeleteBtn();
            ContextMenu.SetLabelText(RPD_2DComponent.GetName(RPD_2DComponent.componentType.reciprocating_clasp));
        }

        else
        {
            ContextMenu.SetTooth(transform.GetComponentInParent<GenericTooth>(), (RPD_2DComponent.componentType)System.Enum.Parse(typeof(RPD_2DComponent.componentType), this.name));
            ContextMenu.ShowMeshDeleteBtn();
            ContextMenu.SetLabelText(RPD_2DComponent.GetName((RPD_2DComponent.componentType)System.Enum.Parse(typeof(RPD_2DComponent.componentType), this.name)));
        }
    }
}
