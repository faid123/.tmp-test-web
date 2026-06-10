using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using UnityEditor;
using UnityEngine.UI;
using Constants;

#if UNITY_EDITOR
public class PositionCopyHelper : ScriptableWizard
{
	//hidden for now
	//[MenuItem("2D RPD Helpers/Position Copier Helper")]
	static void CreateWizard()
	{
		DisplayWizard<PositionCopyHelper>("Populate Sprite Data", "Copy And Close Window", "Copy");
	}

	public RPDComponent componentToModify;

	//Calling OnWizardCreate will close the window
	private void OnWizardCreate()
	{
		Populate();
	}

	//Calling OnWizardOtherButton will not close the window
	private void OnWizardOtherButton()
	{
		Populate();
	}

	void Populate()
	{
		RPDComponent comp = componentToModify;
		
		comp.componentVisuals[1].tooth18_28.positionOffset = comp.componentVisuals[0].tooth18_28.positionOffset.Copy();
		comp.componentVisuals[1].tooth17_27.positionOffset = comp.componentVisuals[0].tooth17_27.positionOffset.Copy();
		comp.componentVisuals[1].tooth16_26.positionOffset = comp.componentVisuals[0].tooth16_26.positionOffset.Copy();
		comp.componentVisuals[1].tooth15_25.positionOffset = comp.componentVisuals[0].tooth15_25.positionOffset.Copy();
		comp.componentVisuals[1].tooth14_24.positionOffset = comp.componentVisuals[0].tooth14_24.positionOffset.Copy();
		comp.componentVisuals[1].tooth13_23.positionOffset = comp.componentVisuals[0].tooth13_23.positionOffset.Copy();
		comp.componentVisuals[1].tooth12_22.positionOffset = comp.componentVisuals[0].tooth12_22.positionOffset.Copy();
		comp.componentVisuals[1].tooth11_21.positionOffset = comp.componentVisuals[0].tooth11_21.positionOffset.Copy();

		comp.componentVisuals[1].tooth38_48.positionOffset = comp.componentVisuals[0].tooth38_48.positionOffset.Copy();
		comp.componentVisuals[1].tooth37_47.positionOffset = comp.componentVisuals[0].tooth37_47.positionOffset.Copy();
		comp.componentVisuals[1].tooth36_46.positionOffset = comp.componentVisuals[0].tooth36_46.positionOffset.Copy();
		comp.componentVisuals[1].tooth35_45.positionOffset = comp.componentVisuals[0].tooth35_45.positionOffset.Copy();
		comp.componentVisuals[1].tooth34_44.positionOffset = comp.componentVisuals[0].tooth34_44.positionOffset.Copy();
		comp.componentVisuals[1].tooth33_43.positionOffset = comp.componentVisuals[0].tooth33_43.positionOffset.Copy();
		comp.componentVisuals[1].tooth32_42.positionOffset = comp.componentVisuals[0].tooth32_42.positionOffset.Copy();
		comp.componentVisuals[1].tooth31_41.positionOffset = comp.componentVisuals[0].tooth31_41.positionOffset.Copy();

		comp.SetDirty();
	}
}

#endif
